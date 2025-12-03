import { Express } from 'express';
import { handleVoiceWebhook, healthCheck } from '../controllers/voiceWebhook';
import { businessSignup } from '../controllers/authController';
import { getBusiness, updateBusiness } from '../controllers/adminController';

/**
 * Register all routes
 */
export function registerRoutes(app: Express): void {
  // Health check
  app.get('/health', healthCheck);
  
  // Auth routes
  app.post('/auth/business/signup', businessSignup);
  
  // Admin routes
  app.get('/admin/businesses/:id', getBusiness);
  app.put('/admin/businesses/:id', updateBusiness);
  
  // Voice webhook endpoint
  // Equivalent to Webhook node path in n8n workflow
  app.post('/webhooks/voice', handleVoiceWebhook);
  
  // Alternative path for compatibility
  app.post('/webhook', handleVoiceWebhook);
}

