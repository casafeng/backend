import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../server/app';
import { VapiWebhookPayload } from '../../types/vapi';

// Mock external services
jest.mock('../../integrations/googleCalendar', () => ({
  getCalendarClient: jest.fn(),
  getCalendarId: jest.fn(() => 'test-calendar-id'),
  checkSlotAvailability: jest.fn(() => Promise.resolve(true)),
  createCalendarEvent: jest.fn(() => Promise.resolve({ id: 'event-123' })),
  findAvailableSlots: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../integrations/openai', () => ({
  getOpenAIClient: jest.fn(),
  getOpenAIModel: jest.fn(() => 'gpt-4o'),
  getReceptionistTools: jest.fn(() => []),
}));

jest.mock('../../db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    callLog: {
      create: jest.fn(() => Promise.resolve({ id: 'log-123' })),
      update: jest.fn(() => Promise.resolve({})),
    },
    appointment: {
      create: jest.fn(() => Promise.resolve({ id: 'appt-123', googleEventId: 'event-123' })),
    },
  })),
}));

describe('Webhook Integration Test', () => {
  let app: Express.Application;
  
  beforeAll(() => {
    // Set minimal env vars for testing
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GOOGLE_CALENDAR_ID = 'test-calendar';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.BUSINESS_TIMEZONE = 'America/New_York';
    process.env.BUSINESS_HOURS_START = '09:00';
    process.env.BUSINESS_HOURS_END = '18:00';
    process.env.BUSINESS_DAYS = '1,2,3,4,5';
    process.env.APPOINTMENT_DURATION_MINUTES = '30';
    
    app = createApp();
  });
  
  it('should handle valid webhook payload and return correct response format', async () => {
    const payload: VapiWebhookPayload = {
      body: {
        message: {
          toolCalls: [
            {
              id: 'test-tool-call-123',
              function: {
                name: 'bookAppointment',
                arguments: {
                  Name: 'Test User',
                  'Phone Number': '+1234567890',
                  'Date and Time': '2024-01-15T14:00:00-05:00',
                  'Email Address': 'test@example.com',
                },
              },
            },
          ],
        },
      },
    };
    
    const response = await request(app as any)
      .post('/webhooks/voice')
      .send(payload)
      .expect(200);
    
    expect(response.body).toHaveProperty('results');
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toHaveProperty('toolCallId', 'test-tool-call-123');
    expect(response.body.results[0]).toHaveProperty('result');
  });
  
  it('should return 400 for invalid payload', async () => {
    const response = await request(app as any)
      .post('/webhooks/voice')
      .send({ invalid: 'payload' })
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });
  
  it('should return 400 when name is missing', async () => {
    const payload: VapiWebhookPayload = {
      body: {
        message: {
          toolCalls: [
            {
              id: 'test-id',
              function: {
                name: 'bookAppointment',
                arguments: {
                  'Phone Number': '+1234567890',
                },
              },
            },
          ],
        },
      },
    };
    
    const response = await request(app as any)
      .post('/webhooks/voice')
      .send(payload)
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
  });
});

