import { Express } from 'express';
import { handleVoiceWebhook, healthCheck } from '../controllers/voiceWebhook';
import { businessSignup, businessLogin } from '../controllers/authController';
import { getBusiness, getBusinessByEmail, updateBusiness, updateBusinessByEmail, updateKnowledgeBase, getCallLogs, getCallLogsByPath, getAppointments, getAppointmentsByPath } from '../controllers/adminController';

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
  app.post('/auth/business/login', businessLogin);
  
  // Admin routes
  // Note: specific routes (by-email, /kb, /call-logs, /appointments) must come before :id route to avoid route conflicts
  
  // Query parameter routes (frontend uses these)
  app.get('/admin/call-logs', getCallLogs);
  app.get('/admin/appointments', getAppointments);
  
  // Path parameter routes (alternative)
  app.get('/admin/businesses/by-email/:email', getBusinessByEmail);
  app.put('/admin/businesses/by-email/:email', updateBusinessByEmail);
  app.post('/admin/businesses/:id/kb', updateKnowledgeBase);
  app.get('/admin/businesses/:id/call-logs', getCallLogsByPath);
  app.get('/admin/businesses/:id/appointments', getAppointmentsByPath);
  app.get('/admin/businesses/:id', getBusiness);
  app.put('/admin/businesses/:id', updateBusiness);
  
  // Voice webhook endpoint
  // Equivalent to Webhook node path in n8n workflow
  app.post('/webhooks/voice', handleVoiceWebhook);
  
  // Alternative path for compatibility
  app.post('/webhook', handleVoiceWebhook);
}

