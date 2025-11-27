import { parseWebhookPayload } from '../callLogService';
import { VapiWebhookPayload } from '../../types/vapi';

describe('callLogService', () => {
  describe('parseWebhookPayload', () => {
    it('should parse valid webhook payload', () => {
      const payload: VapiWebhookPayload = {
        body: {
          message: {
            toolCalls: [
              {
                id: 'test-tool-call-id',
                function: {
                  name: 'bookAppointment',
                  arguments: {
                    Name: 'John Doe',
                    'Phone Number': '+1234567890',
                    'Date and Time': '2024-01-15T14:00:00-05:00',
                    'Email Address': 'john@example.com',
                  },
                },
              },
            ],
          },
        },
      };
      
      const result = parseWebhookPayload(payload);
      
      expect(result).not.toBeNull();
      expect(result?.toolCallId).toBe('test-tool-call-id');
      expect(result?.callerName).toBe('John Doe');
      expect(result?.callerPhone).toBe('+1234567890');
      expect(result?.email).toBe('john@example.com');
      expect(result?.requestedStart).toBeInstanceOf(Date);
    });
    
    it('should return null for invalid payload', () => {
      const payload = {
        body: {},
      };
      
      const result = parseWebhookPayload(payload as VapiWebhookPayload);
      expect(result).toBeNull();
    });
    
    it('should handle missing optional fields', () => {
      const payload: VapiWebhookPayload = {
        body: {
          message: {
            toolCalls: [
              {
                id: 'test-id',
                function: {
                  name: 'bookAppointment',
                  arguments: {
                    Name: 'Jane Doe',
                  },
                },
              },
            ],
          },
        },
      };
      
      const result = parseWebhookPayload(payload);
      
      expect(result).not.toBeNull();
      expect(result?.callerName).toBe('Jane Doe');
      expect(result?.callerPhone).toBeUndefined();
      expect(result?.email).toBeUndefined();
    });
  });
});

