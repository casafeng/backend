/**
 * TypeScript types for Business Knowledge Base
 * Defines the structure of knowledgeBase JSON field on Business model
 */

export interface BusinessKnowledgeBase {
  hours?: {
    [day: string]: { open: string; close: string } | null;
    // Example: { monday: { open: "09:00", close: "18:00" }, sunday: null }
  };
  address?: string;
  menuHighlights?: string[]; // Array of dish names or menu highlights
  policies?: {
    cancellation?: string;
    groupBooking?: string;
    specialRequests?: string;
    [key: string]: string | undefined;
  };
  faqs?: Array<{ question: string; answer: string }>;
  notes?: string; // Free-form additional information
}

