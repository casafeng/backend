/**
 * TypeScript types for OpenAI function calling / tool definitions
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  toolCallId: string;
  result: string | object;
}

/**
 * Tool function signatures
 */
export interface CheckAvailabilityParams {
  startTime: string; // ISO 8601 datetime string
  endTime: string;   // ISO 8601 datetime string
}

export interface BookAppointmentParams {
  startTime: string; // ISO 8601 datetime string
  endTime: string;   // ISO 8601 datetime string
  name: string;
  phone?: string;
  email?: string;
}

