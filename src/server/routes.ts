import { Express } from 'express';
import { handleVoiceWebhook, healthCheck } from '../controllers/voiceWebhook';

/**
 * Register all routes
 */
export function registerRoutes(app: Express): void {
  // Health check
  app.get('/health', healthCheck);
  
  // Voice webhook endpoint
  // Equivalent to Webhook node path in n8n workflow
  app.post('/webhooks/voice', handleVoiceWebhook);
  
  // Alternative path for compatibility
  app.post('/webhook', handleVoiceWebhook);
}

