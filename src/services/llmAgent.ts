import OpenAI from 'openai';
import { getOpenAIClient, getOpenAIModel, getReceptionistTools } from '../integrations/openai';
import { checkAvailability, findNextAvailableSlots, bookAppointment } from './bookingService';
import { CheckAvailabilityParams, BookAppointmentParams } from '../types/llm';
import { ToolCall } from '../types/llm';

/**
 * LLM Agent service
 * Implements the AI receptionist logic matching the n8n workflow
 * System message rules:
 * - Always check availability before booking
 * - If unavailable, propose next 3 closest times
 * - If available, book and confirm
 * - All appointments are 30 minutes
 */

const SYSTEM_MESSAGE = `#Overview
You are a helpful assistant that can look up availability and book appointments.

#Tools
Calendar Availability Tool
Book Calendar Tool

#Rules 
You must check availability first before booking an appointment.
If the appointment is unavailable get the next 3 closest appointments and output: "The requested time is unavailable, these times are (the next 3 closest times do not number)"
If the appointment is available book the requested appointment and output: "The appointment has been booked"
All appointments are 30 minutes in length`;

const ALTERNATIVE_LOOKAHEAD_DAYS = 60;
const ALTERNATIVE_CANDIDATE_MULTIPLIER = 10;

/**
 * Execute a tool call from the LLM
 */
async function executeTool(toolCall: ToolCall): Promise<string> {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);
  
  try {
    if (functionName === 'checkAvailability') {
      const params = args as CheckAvailabilityParams;
      const start = new Date(params.startTime);
      const end = new Date(params.endTime);
      
      const result = await checkAvailability(start, end);
      
      if (result.available) {
        return `The time slot from ${start.toLocaleString()} to ${end.toLocaleString()} is available.`;
      } else {
        return `The time slot from ${start.toLocaleString()} to ${end.toLocaleString()} is not available. Reason: ${result.reason}`;
      }
    }
    
    if (functionName === 'bookAppointment') {
      const params = args as BookAppointmentParams;
      const start = new Date(params.startTime);
      const end = new Date(params.endTime);
      
      // Validate that end is after start
      if (end <= start) {
        return `Error: End time must be after start time.`;
      }
      
      // Validate not in the past
      if (start < new Date()) {
        return `Error: Cannot book appointments in the past.`;
      }
      
      const booked = await bookAppointment({
        start,
        end,
        name: params.name,
        phone: params.phone,
        email: params.email,
      });
      
      return `The appointment has been booked for ${start.toLocaleString()} to ${end.toLocaleString()}. Event ID: ${booked.googleEventId}`;
    }
    
    return `Unknown tool: ${functionName}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return `Error executing ${functionName}: ${errorMessage}`;
  }
}

/**
 * Process an appointment request through the LLM agent
 * Returns the final response message to send back to Vapi
 */
export interface ProcessAppointmentRequestParams {
  name: string;
  phone?: string;
  email?: string;
  requestedDateTime?: string; // Natural language or ISO string
  callLogId?: string;
  businessId?: string;
  businessContextPrompt?: string;
}

export interface ProcessAppointmentResult {
  message: string;
  status: 'booked' | 'suggested_alternatives' | 'failed';
  bookedAppointmentId?: string;
  suggestedTimes?: Date[];
}

export async function processAppointmentRequest(
  params: ProcessAppointmentRequestParams
): Promise<ProcessAppointmentResult> {
  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const tools = getReceptionistTools();
  
  // Build user message with appointment details
  const prefix = params.businessContextPrompt ? `${params.businessContextPrompt}\n\n` : '';
  const userMessage = `${prefix}The details of the requested appointment are:
Name: ${params.name}
${params.phone ? `Phone Number: ${params.phone}` : ''}
${params.requestedDateTime ? `Date and Time: ${params.requestedDateTime}` : ''}
${params.email ? `Email Address: ${params.email}` : ''}

Please check availability and book the appointment if available, or suggest the next 3 closest available times if not.`;
  
  let conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_MESSAGE },
    { role: 'user', content: userMessage },
  ];
  
  const maxIterations = 10; // Prevent infinite loops
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    // Call OpenAI
    const response = await client.chat.completions.create({
      model,
      messages: conversationHistory,
      tools,
      tool_choice: 'auto',
    });
    
    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('No response from OpenAI');
    }
    
    // Add assistant message to history
    conversationHistory.push(message);
    
    // If no tool calls, we're done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      const content = message.content || 'Appointment processing completed.';
      
      // Determine status from message content
      let status: 'booked' | 'suggested_alternatives' | 'failed' = 'failed';
      if (content.toLowerCase().includes('appointment has been booked')) {
        status = 'booked';
      } else if (content.toLowerCase().includes('unavailable') || content.toLowerCase().includes('these times are')) {
        status = 'suggested_alternatives';
      }
      
      return {
        message: content,
        status,
      };
    }
    
    // Execute tool calls
    const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    
    for (const toolCall of message.tool_calls) {
      const result = await executeTool({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || '{}',
        },
      });
      
      toolResults.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
    
    conversationHistory.push(...toolResults);
  }
  
  // Max iterations reached
  return {
    message: 'Unable to complete appointment booking. Please try again.',
    status: 'failed',
  };
}

/**
 * Enhanced version that handles unavailable slots by finding alternatives
 * This implements the n8n workflow rule: "if unavailable, get next 3 closest times"
 */
export async function processAppointmentRequestWithAlternatives(
  params: ProcessAppointmentRequestParams
): Promise<ProcessAppointmentResult> {
  // If we have a requested datetime, check availability first
  if (params.requestedDateTime) {
    try {
      const requestedStart = new Date(params.requestedDateTime);
      if (!isNaN(requestedStart.getTime())) {
        const requestedEnd = new Date(requestedStart.getTime() + 30 * 60 * 1000);
        const availability = await checkAvailability(requestedStart, requestedEnd);
        
        if (availability.available) {
          // Try to book directly
          try {
            const booked = await bookAppointment({
              start: requestedStart,
              end: requestedEnd,
              name: params.name,
              phone: params.phone,
              email: params.email,
              callLogId: params.callLogId,
              businessId: params.businessId,
            });
            
            return {
              message: 'The appointment has been booked',
              status: 'booked',
              bookedAppointmentId: booked.id,
              suggestedTimes: [requestedStart], // Store booked time for logging
            };
          } catch (error) {
            // Booking failed, fall through to find alternatives
            console.error('Direct booking failed:', error);
          }
        }
        
        // Requested time is unavailable, find alternatives
        const alternatives = await findNextAvailableSlots(
          requestedStart,
          3,
          ALTERNATIVE_LOOKAHEAD_DAYS,
          ALTERNATIVE_CANDIDATE_MULTIPLIER
        );
        
        if (alternatives.length > 0) {
          const timesText = alternatives
            .map(dt => dt.toLocaleString())
            .join(', ');
          
          return {
            message: `The requested time is unavailable, these times are ${timesText}`,
            status: 'suggested_alternatives',
            suggestedTimes: alternatives,
          };
        } else {
          return {
            message: `The requested time is unavailable, and no alternative times were found in the next ${ALTERNATIVE_LOOKAHEAD_DAYS} days.`,
            status: 'suggested_alternatives',
            suggestedTimes: [],
          };
        }
      }
    } catch (error) {
      console.error('Error in availability check:', error);
      // Fall through to LLM processing
    }
  }
  
  // Fall back to LLM agent for natural language processing
  return await processAppointmentRequest(params);
}

