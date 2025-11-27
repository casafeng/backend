import { formatBusinessKnowledgeBase } from '../knowledgeBaseService';
import { Business } from '@prisma/client';

describe('knowledgeBaseService', () => {
  describe('formatBusinessKnowledgeBase', () => {
    it('should return undefined if business has no knowledgeBase', () => {
      const business: Business = {
        id: 'test-id',
        name: 'Test Restaurant',
        phoneNumber: '+1234567890',
        timezone: 'Europe/Rome',
        description: null,
        knowledgeBase: null,
        createdAt: new Date(),
      };

      const result = formatBusinessKnowledgeBase(business);
      expect(result).toBeUndefined();
    });

    it('should format knowledge base with hours, address, menu, policies, and FAQs', () => {
      const business: Business = {
        id: 'test-id',
        name: 'Ristorante Bella Vista',
        phoneNumber: '+1234567890',
        timezone: 'Europe/Rome',
        description: null,
        knowledgeBase: {
          hours: {
            monday: { open: '09:00', close: '18:00' },
            tuesday: { open: '09:00', close: '18:00' },
            wednesday: { open: '09:00', close: '18:00' },
            thursday: { open: '09:00', close: '18:00' },
            friday: { open: '09:00', close: '18:00' },
            saturday: null,
            sunday: null,
          },
          address: 'Via Roma 123, Milano',
          menuHighlights: ['Pasta Carbonara', 'Pizza Margherita', 'Tiramisu'],
          policies: {
            cancellation: 'Cancellazione gratuita fino a 24 ore prima',
            groupBooking: 'Prenotazioni di gruppo disponibili per 8+ persone',
          },
          faqs: [
            {
              question: 'Accettate carte di credito?',
              answer: 'Sì, accettiamo tutte le principali carte di credito',
            },
          ],
        },
        createdAt: new Date(),
      };

      const result = formatBusinessKnowledgeBase(business);
      expect(result).toBeDefined();
      expect(result).toContain('Ristorante Bella Vista');
      expect(result).toContain('Orari:');
      expect(result).toContain('Lunedì: 09:00 - 18:00');
      expect(result).toContain('Indirizzo: Via Roma 123, Milano');
      expect(result).toContain('Piatti principali: Pasta Carbonara, Pizza Margherita, Tiramisu');
      expect(result).toContain('Politiche:');
      expect(result).toContain('Cancellazione: Cancellazione gratuita fino a 24 ore prima');
      expect(result).toContain('Domande frequenti:');
    });

    it('should return undefined if KB only has business name (no actual data)', () => {
      const business: Business = {
        id: 'test-id',
        name: 'Test Restaurant',
        phoneNumber: '+1234567890',
        timezone: 'Europe/Rome',
        description: null,
        knowledgeBase: {
          hours: {},
        },
        createdAt: new Date(),
      };

      const result = formatBusinessKnowledgeBase(business);
      expect(result).toBeUndefined();
    });

    it('should handle partial KB data (only address)', () => {
      const business: Business = {
        id: 'test-id',
        name: 'Test Restaurant',
        phoneNumber: '+1234567890',
        timezone: 'Europe/Rome',
        description: null,
        knowledgeBase: {
          address: 'Via Test 456',
        },
        createdAt: new Date(),
      };

      const result = formatBusinessKnowledgeBase(business);
      expect(result).toBeDefined();
      expect(result).toContain('Test Restaurant');
      expect(result).toContain('Indirizzo: Via Test 456');
    });

    it('should handle invalid JSON gracefully', () => {
      const business: Business = {
        id: 'test-id',
        name: 'Test Restaurant',
        phoneNumber: '+1234567890',
        timezone: 'Europe/Rome',
        description: null,
        knowledgeBase: 'invalid-json' as any,
        createdAt: new Date(),
      };

      // Should not throw, should return undefined
      const result = formatBusinessKnowledgeBase(business);
      expect(result).toBeUndefined();
    });
  });
});

