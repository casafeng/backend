import { BusinessKnowledgeBase } from '../types/knowledgeBase';
import { Business } from '@prisma/client';

/**
 * Knowledge Base service
 * Formats business knowledge base data into Italian text for LLM context injection
 */

/**
 * Format business knowledge base as Italian text prompt
 * Returns a formatted string to inject into the LLM context, or undefined if no KB data
 */
export function formatBusinessKnowledgeBase(business: Business): string | undefined {
  if (!business.knowledgeBase) {
    return undefined;
  }

  try {
    const kb = business.knowledgeBase as BusinessKnowledgeBase;
    const parts: string[] = [];

    // Business name context
    parts.push(`Questa chiamata riguarda il ristorante ${business.name}.`);

    // Hours
    if (kb.hours) {
      const hoursEntries = Object.entries(kb.hours)
        .filter(([_, times]) => times !== null)
        .map(([day, times]) => {
          const dayName = getDayNameItalian(day);
          // TypeScript: times is guaranteed non-null after filter
          if (times === null) return '';
          return `${dayName}: ${times.open} - ${times.close}`;
        })
        .filter(entry => entry.length > 0);
      if (hoursEntries.length > 0) {
        parts.push(`Orari: ${hoursEntries.join(', ')}`);
      }
    }

    // Address
    if (kb.address) {
      parts.push(`Indirizzo: ${kb.address}`);
    }

    // Menu highlights
    if (kb.menuHighlights && kb.menuHighlights.length > 0) {
      parts.push(`Piatti principali: ${kb.menuHighlights.join(', ')}`);
    }

    // Policies
    if (kb.policies) {
      const policyEntries = Object.entries(kb.policies)
        .filter(([_, value]) => value && value.trim().length > 0)
        .map(([key, value]) => {
          const policyName = getPolicyNameItalian(key);
          return `${policyName}: ${value}`;
        });
      if (policyEntries.length > 0) {
        parts.push(`Politiche: ${policyEntries.join('; ')}`);
      }
    }

    // FAQs
    if (kb.faqs && kb.faqs.length > 0) {
      const faqsText = kb.faqs
        .map(f => `Domanda: ${f.question} - Risposta: ${f.answer}`)
        .join('; ');
      parts.push(`Domande frequenti: ${faqsText}`);
    }

    // Notes
    if (kb.notes) {
      parts.push(`Note aggiuntive: ${kb.notes}`);
    }

    if (parts.length <= 1) {
      // Only business name, no actual KB data
      return undefined;
    }

    return parts.join('\n');
  } catch (error) {
    console.error('Error formatting knowledge base:', error);
    return undefined;
  }
}

/**
 * Convert English day name to Italian
 */
function getDayNameItalian(day: string): string {
  const dayMap: Record<string, string> = {
    monday: 'Lunedì',
    tuesday: 'Martedì',
    wednesday: 'Mercoledì',
    thursday: 'Giovedì',
    friday: 'Venerdì',
    saturday: 'Sabato',
    sunday: 'Domenica',
    lunedì: 'Lunedì',
    martedì: 'Martedì',
    mercoledì: 'Mercoledì',
    giovedì: 'Giovedì',
    venerdì: 'Venerdì',
    sabato: 'Sabato',
    domenica: 'Domenica',
  };
  return dayMap[day.toLowerCase()] || day;
}

/**
 * Convert English policy key to Italian label
 */
function getPolicyNameItalian(key: string): string {
  const policyMap: Record<string, string> = {
    cancellation: 'Cancellazione',
    groupBooking: 'Prenotazioni di gruppo',
    specialRequests: 'Richieste speciali',
  };
  return policyMap[key.toLowerCase()] || key;
}

