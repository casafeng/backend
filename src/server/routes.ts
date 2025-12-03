import { Express } from 'express';
import { handleVoiceWebhook, healthCheck } from '../controllers/voiceWebhook';
import { businessSignup } from '../controllers/authController';
import { getBusiness, getBusinessByEmail, updateBusiness, updateBusinessByEmail, updateKnowledgeBase, getCallLogs, getAppointments } from '../controllers/adminController';

/**
 * Register all routes
 */
export function registerRoutes(app: Express): void {
  // Root endpoint for deployment checks
  app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'ai-receptionist-backend' });
  });
  
  // Health check
  app.get('/health', healthCheck);
  
  // Auth routes
  app.post('/auth/business/signup', businessSignup);
  
  // Admin routes
  // Note: specific routes (by-email, /kb, /call-logs, /appointments) must come before :id route to avoid route conflicts
  app.get('/admin/businesses/by-email/:email', getBusinessByEmail);
  app.put('/admin/businesses/by-email/:email', updateBusinessByEmail);
  app.post('/admin/businesses/:id/kb', updateKnowledgeBase);
  app.get('/admin/businesses/:id/call-logs', getCallLogs);
  app.get('/admin/businesses/:id/appointments', getAppointments);
  app.get('/admin/businesses/:id', getBusiness);
  app.put('/admin/businesses/:id', updateBusiness);
  
  // Voice webhook endpoint
  // Equivalent to Webhook node path in n8n workflow
  app.post('/webhooks/voice', handleVoiceWebhook);
  
  // Alternative path for compatibility
  app.post('/webhook', handleVoiceWebhook);
}

