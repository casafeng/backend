import { Request, Response } from 'express';
import { VapiWebhookPayload, VapiWebhookResponse } from '../types/vapi';
import { parseWebhookPayload, createCallLog, updateCallLog, parseToolArguments } from '../services/callLogService';
import { processAppointmentRequestWithAlternatives } from '../services/llmAgent';
import { verifyVapiRequest, verifyTwilioRequest } from '../integrations/twilio';
import { getPrismaClient } from '../db/prisma';
import { formatBusinessKnowledgeBase } from '../services/knowledgeBaseService';

/**
 * Voice webhook controller
 * Handles POST requests from Vapi/Twilio
 * Equivalent to Webhook node and Respond to Webhook node in n8n workflow
 */

/**
 * Parse and validate incoming webhook payload
 */
function parseRequest(req: Request): VapiWebhookPayload | null {
  try {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.log('Incoming body:', JSON.stringify(req.body, null, 2));
      } catch {
        console.log('Incoming body: [unserializable]');
      }
    }
    // Some providers wrap under { body: { message: ... } }, others send { message: ... } at root,
    // and Vapi server tools may send { toolCall: { id, name, arguments } } at the top level.
    const raw: any = req.body;
    let normalized: VapiWebhookPayload;
    if (raw?.body?.message?.toolCalls) {
      normalized = raw as VapiWebhookPayload;
    } else if (raw?.message?.toolCalls) {
      normalized = { body: raw } as VapiWebhookPayload;
    } else if (raw?.toolCall) {
      const tc = raw.toolCall;
      const stringifiedArgs =
        typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? {});
      normalized = {
        body: {
          message: {
            toolCalls: [
              {
                id: tc.id,
                function: {
                  name: tc.name,
                  arguments: stringifiedArgs,
                },
              },
            ],
          },
        },
      } as unknown as VapiWebhookPayload;
      if (process.env.NODE_ENV !== 'production') {
        console.log('Normalized top-level toolCall into message.toolCalls[0]');
      }
    } else {
      // Final fallback: deep-scan payload for an object that looks like a tool call
      const candidate = findToolCallDeep(raw);
      if (candidate) {
        const stringifiedArgs =
          typeof candidate.arguments === 'string'
            ? candidate.arguments
            : JSON.stringify(candidate.arguments ?? {});
        normalized = {
          body: {
            message: {
              toolCalls: [
                {
                  id: candidate.id ?? 'tool_call_auto',
                  function: {
                    name: candidate.name,
                    arguments: stringifiedArgs,
                  },
                },
              ],
            },
          },
        } as unknown as VapiWebhookPayload;
        if (process.env.NODE_ENV !== 'production') {
          console.log('Deep-scanned payload and normalized tool call');
        }
      } else {
        normalized = { body: raw } as VapiWebhookPayload;
      }
    }

    if (!normalized?.body?.message?.toolCalls?.[0]) {
      return normalized;
    }

    return normalized;
  } catch (error) {
    console.error('Error parsing webhook request:', error);
    return null;
  }
}

/**
 * Recursively search an object for a "tool call"-like shape.
 * Accepts various shapes: { toolCall: { id, name, arguments } }, { name, arguments }, etc.
 */
function findToolCallDeep(input: any): { id?: string; name: string; arguments: unknown } | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  // Direct shapes
  if (
    typeof (input as any).name === 'string' &&
    Object.prototype.hasOwnProperty.call(input, 'arguments')
  ) {
    return {
      id: (input as any).id,
      name: (input as any).name,
      arguments: (input as any).arguments,
    };
  }
  if (input.toolCall && typeof input.toolCall === 'object') {
    const tc = findToolCallDeep(input.toolCall);
    if (tc) return tc;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const tc = findToolCallDeep(item);
      if (tc) return tc;
    }
    return null;
  }
  // Generic object traversal
  for (const key of Object.keys(input)) {
    const tc = findToolCallDeep((input as any)[key]);
    if (tc) return tc;
  }
  return null;
}

/**
 * Extract appointment details from webhook payload
 */
function extractAppointmentDetails(payload: VapiWebhookPayload) {
  const toolCall = payload.body.message.toolCalls[0];
  const args = parseToolArguments(toolCall) as Record<string, any>;
  
  return {
    toolCallId: toolCall.id,
    name: args.Name || '',
    phone: args['Phone Number'],
    email: args['Email Address'],
    requestedDateTime: args['Date and Time'],
  };
}

/**
 * Main webhook handler
 * POST /webhooks/voice
 */
export async function handleVoiceWebhook(req: Request, res: Response): Promise<void> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Incoming webhook headers:', req.headers);
      console.log('Incoming x-vapi-secret:', req.headers['x-vapi-secret']);
      console.log('VAPI_SIGNING_SECRET:', process.env.VAPI_SIGNING_SECRET);
    }

    // Determine called number to route to a business
    const raw: any = req.body?.body ?? req.body;
    const calledNumber: string | undefined =
      raw?.to ?? raw?.phoneNumber?.number ?? raw?.server?.to ?? undefined;
    let businessId: string | undefined;
    let businessContextPrompt: string | undefined;
    if (calledNumber) {
      const prisma = getPrismaClient();
      const business = await prisma.business.findUnique({
        where: { phoneNumber: calledNumber },
      });
      if (!business) {
        console.warn('No business matched for called number:', calledNumber);
        res.status(200).json({ action: 'hangup' });
        return;
      }
      businessId = business.id;
      // Format knowledge base if present
      const kbPrompt = formatBusinessKnowledgeBase(business);
      if (kbPrompt) {
        businessContextPrompt = kbPrompt;
      } else {
        // Fallback to basic context if no KB
        businessContextPrompt = `You are the AI assistant for the business associated with the number ${calledNumber}.`;
      }
    }

    // Signature verification (Vapi / Twilio)
    const vapiValid = verifyVapiRequest(req);
    const twilioValid = verifyTwilioRequest(req);
    // Accept the request if EITHER Vapi OR Twilio verification succeeds.
    // This supports flows where only one provider is sending the webhook.
    if (!vapiValid && !twilioValid) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    // Parse and validate payload
    const payload = parseRequest(req);
    if (!payload) {
      res.status(400).json({
        error: 'Invalid webhook payload. Expected body.message.toolCalls[0]',
      });
      return;
    }
    if (!payload.body?.message?.toolCalls || payload.body.message.toolCalls.length === 0) {
      const rb: any = req.body?.body ?? req.body;
      const hasPotentialTool = Boolean(rb?.message?.toolCalls || rb?.toolCall);
      if (!hasPotentialTool) {
        res.status(400).json({ error: 'Invalid webhook payload. No message.toolCalls found.' });
        return;
      }
      console.log('No toolCalls present; returning 200 for now');
      res.status(200).send('No tool calls to handle');
      return;
    }
    
    // Extract appointment details
    const details = extractAppointmentDetails(payload);
    
    if (!details.name) {
      res.status(400).json({
        error: 'Name is required',
      });
      return;
    }

    // Guard: avoid booking past dates
    if (details.requestedDateTime) {
      const requestedStart = new Date(details.requestedDateTime);
      if (!isNaN(requestedStart.getTime()) && requestedStart.getTime() < Date.now()) {
        console.warn('Requested date is in the past:', requestedStart.toISOString());
        const responsePast: VapiWebhookResponse = {
          results: [
            {
              toolCallId: details.toolCallId,
              result:
                'The date provided appears to be in the past. Please ask the customer to confirm the year and the exact date.',
            },
          ],
        };
        res.status(200).json(responsePast);
        return;
      }
    }
    
    // Create call log entry immediately
    const callLogParams = parseWebhookPayload(payload);
    let callLogId: string | undefined;
    
    if (callLogParams) {
      const callLog = await createCallLog({ ...callLogParams, businessId });
      callLogId = callLog.id;
    }
    
    // Process appointment request through LLM agent
    const result = await processAppointmentRequestWithAlternatives({
      name: details.name,
      phone: details.phone,
      email: details.email,
      requestedDateTime: details.requestedDateTime,
      callLogId,
      businessId,
      businessContextPrompt,
    });
    
    // Update call log with results
    if (callLogId) {
      await updateCallLog({
        id: callLogId,
        status: result.status,
        bookedStart: result.status === 'booked' && result.suggestedTimes?.[0] 
          ? result.suggestedTimes[0] 
          : undefined,
        bookedEnd: result.status === 'booked' && result.suggestedTimes?.[0]
          ? new Date(result.suggestedTimes[0].getTime() + 30 * 60 * 1000)
          : undefined,
        decisionReason: result.message,
      });
    }
    
    // Return response in Vapi format
    // Equivalent to Respond to Webhook node in n8n workflow
    const response: VapiWebhookResponse = {
      results: [
        {
          toolCallId: details.toolCallId,
          result: result.message,
        },
      ],
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error handling voice webhook:', error);
    
    // Try to extract toolCallId for error response
    let toolCallId = 'unknown';
    try {
      const payload = parseRequest(req);
      if (payload) {
        toolCallId = payload.body.message.toolCalls[0].id;
      }
    } catch {
      // Ignore
    }
    
    const errorResponse: VapiWebhookResponse = {
      results: [
        {
          toolCallId,
          result: 'An error occurred while processing your appointment request. Please try again later.',
        },
      ],
    };
    
    res.status(500).json(errorResponse);
  }
}

/**
 * Health check endpoint
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

