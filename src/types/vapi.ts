/**
 * TypeScript types for Vapi/Twilio webhook payloads
 * Based on the n8n workflow structure
 */

export interface VapiWebhookPayload {
  body: {
    message: {
      toolCalls: Array<{
        id: string;
        function: {
          name: string;
          arguments:
            | {
                Name?: string;
                'Phone Number'?: string;
                'Date and Time'?: string;
                'Email Address'?: string;
                [key: string]: unknown;
              }
            | string;
        };
      }>;
    };
    // Allow additional fields for extensibility
    [key: string]: unknown;
  };
}

export interface VapiWebhookResponse {
  results: Array<{
    toolCallId: string;
    result: string;
  }>;
}

/**
 * Parsed appointment request from webhook
 */
export interface AppointmentRequest {
  toolCallId: string;
  name: string;
  phone?: string;
  email?: string;
  requestedDateTime?: string; // ISO string or natural language
}

