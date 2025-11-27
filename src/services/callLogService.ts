import { getPrismaClient } from '../db/prisma';
import { VapiWebhookPayload } from '../types/vapi';

/**
 * Call log service
 * Persists call information and appointment booking results to Supabase
 */

export interface CreateCallLogParams {
  businessId?: string;
  toolCallId: string;
  callerPhone?: string;
  callerName?: string;
  email?: string;
  requestedStart?: Date;
  requestedEnd?: Date;
  rawPayload?: unknown;
}

export interface UpdateCallLogParams {
  id: string;
  bookedStart?: Date;
  bookedEnd?: Date;
  status: 'booked' | 'suggested_alternatives' | 'failed' | 'unavailable';
  decisionReason?: string;
}

/**
 * Create a new call log entry
 * Called immediately when webhook is received
 */
export async function createCallLog(params: CreateCallLogParams) {
  const prisma = getPrismaClient();
  
  return await prisma.callLog.create({
    data: {
      businessId: params.businessId,
      toolCallId: params.toolCallId,
      callerPhone: params.callerPhone,
      callerName: params.callerName,
      email: params.email,
      requestedStart: params.requestedStart,
      requestedEnd: params.requestedEnd,
      rawPayload: params.rawPayload as object,
      status: 'pending',
    },
  });
}

/**
 * Update call log with booking results
 */
export async function updateCallLog(params: UpdateCallLogParams) {
  const prisma = getPrismaClient();
  
  return await prisma.callLog.update({
    where: { id: params.id },
    data: {
      bookedStart: params.bookedStart,
      bookedEnd: params.bookedEnd,
      status: params.status,
      decisionReason: params.decisionReason,
    },
  });
}

/**
 * Parse webhook payload and extract call information
 */
export function parseToolArguments(
  toolCall: VapiWebhookPayload['body']['message']['toolCalls'][number]
) {
  const rawArgs = toolCall.function.arguments;
  if (!rawArgs) {
    return {};
  }

  if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs);
      return normalizeArguments(parsed);
    } catch (error) {
      console.error('Failed to parse tool arguments JSON string:', error);
      return {};
    }
  }

  return normalizeArguments(rawArgs);
}

function normalizeArguments(args: Record<string, any>) {
  // Accept both our Postman-style keys and snake_case keys coming from other providers
  const name = args.Name ?? args.name ?? args.full_name;
  const phone = args['Phone Number'] ?? args.phone_number ?? args.phone ?? args.phoneNumber;
  const dateTime = args['Date and Time'] ?? args.date_time ?? args.datetime ?? args.start_time ?? args.startTime;
  const email = args['Email Address'] ?? args.email_address ?? args.email;

  // Preserve original fields but ensure our expected keys exist
  return {
    ...args,
    Name: name,
    'Phone Number': phone,
    'Date and Time': dateTime,
    'Email Address': email,
  };
}

export function parseWebhookPayload(payload: VapiWebhookPayload): CreateCallLogParams | null {
  try {
    const toolCall = payload.body?.message?.toolCalls?.[0];
    if (!toolCall) {
      return null;
    }
    
    const args = parseToolArguments(toolCall) as Record<string, any>;
    const requestedDateTime = args['Date and Time'];
    
    let requestedStart: Date | undefined;
    let requestedEnd: Date | undefined;
    
    if (requestedDateTime) {
      // Try to parse as ISO string or natural language
      requestedStart = new Date(requestedDateTime);
      if (isNaN(requestedStart.getTime())) {
        requestedStart = undefined;
      } else {
        // Default to 30 minutes duration
        requestedEnd = new Date(requestedStart.getTime() + 30 * 60 * 1000);
      }
    }
    
    return {
      toolCallId: toolCall.id,
      callerName: args.Name,
      callerPhone: args['Phone Number'],
      email: args['Email Address'],
      requestedStart,
      requestedEnd,
      rawPayload: payload,
    };
  } catch (error) {
    console.error('Error parsing webhook payload:', error);
    return null;
  }
}

