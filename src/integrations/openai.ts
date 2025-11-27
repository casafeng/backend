import OpenAI from 'openai';
import { getEnv } from '../config/env';
import { ToolDefinition } from '../types/llm';

/**
 * OpenAI client wrapper
 * Handles initialization and provides typed access to Chat Completions API
 */

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const config = getEnv();
    openaiClient = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Get the configured model name
 */
export function getOpenAIModel(): string {
  return getEnv().OPENAI_MODEL;
}

/**
 * Tool definitions for the AI receptionist
 * These match the tools available in the n8n workflow
 */
export function getReceptionistTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'checkAvailability',
        description: 'Check if a time slot is available in the calendar. Always use this before booking an appointment.',
        parameters: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO 8601 format (e.g., 2024-01-15T14:00:00-05:00)',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO 8601 format (e.g., 2024-01-15T14:30:00-05:00)',
            },
          },
          required: ['startTime', 'endTime'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'bookAppointment',
        description: 'Book an appointment in the calendar. Only use this after checking availability.',
        parameters: {
          type: 'object',
          properties: {
            startTime: {
              type: 'string',
              description: 'Start time in ISO 8601 format (e.g., 2024-01-15T14:00:00-05:00)',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO 8601 format (e.g., 2024-01-15T14:30:00-05:00)',
            },
            name: {
              type: 'string',
              description: 'Name of the person booking the appointment',
            },
            phone: {
              type: 'string',
              description: 'Phone number (optional)',
            },
            email: {
              type: 'string',
              description: 'Email address (optional)',
            },
          },
          required: ['startTime', 'endTime', 'name'],
        },
      },
    },
  ];
}

