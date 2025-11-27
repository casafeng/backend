import express, { Express, Request, Response, NextFunction } from 'express';
import { loadEnv } from '../config/env';
import { registerRoutes } from './routes';
import { disconnectPrisma } from '../db/prisma';

/**
 * Express application setup
 * Provider-agnostic - can run on any Node.js environment
 */

let app: Express | null = null;

/**
 * Create and configure Express app
 */
export function createApp(): Express {
  if (app) {
    return app;
  }
  
  // Load and validate environment variables
  loadEnv();
  if (process.env.NODE_ENV !== 'production') {
    // Temporary debug: verify env is loaded correctly (remove after debugging)
    console.log('VAPI_SIGNING_SECRET:', process.env.VAPI_SIGNING_SECRET);
  }
  
  app = express();

  const captureRawBody = (
    req: Request & { rawBody?: string },
    _res: Response,
    buf: Buffer
  ) => {
    req.rawBody = buf.toString('utf8');
  };
  
  // Middleware
  app.use(express.json({ limit: '10mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, verify: captureRawBody }));
  
  // Request logging (simple)
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
  
  // Register routes
  registerRoutes(app);
  
  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  return app;
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  const app = createApp();
  const port = process.env.PORT || 3000;
  
  const server = app.listen(port, () => {
    console.log(`AI Receptionist Backend listening on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  });
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

