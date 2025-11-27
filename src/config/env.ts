import { z } from 'zod';

/**
 * Environment variable configuration and validation
 * Follows 12-factor principles - all config via env vars
 */

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  
  // Google Calendar
  GOOGLE_CALENDAR_ID: z.string().min(1, 'GOOGLE_CALENDAR_ID is required'),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  BUSINESS_TIMEZONE: z.string().default('America/New_York'),
  
  // Business hours (format: HH:mm, 24-hour)
  BUSINESS_HOURS_START: z.string().default('09:00'),
  BUSINESS_HOURS_END: z.string().default('18:00'),
  BUSINESS_DAYS: z.string().default('1,2,3,4,5'), // Monday-Friday (1=Monday, 7=Sunday)
  
  // Database (Supabase)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  
  // Twilio/Vapi
  TWILIO_AUTH_TOKEN: z.string().optional(),
  VAPI_SIGNING_SECRET: z.string().optional(),
  
  // Appointment defaults
  APPOINTMENT_DURATION_MINUTES: z.string().transform(Number).default('30'),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

/**
 * Validates and loads environment variables
 * Call this once at application startup
 */
export function loadEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Environment validation failed:\n${missing}`);
    }
    throw error;
  }
}

/**
 * Get validated environment variables
 * Must call loadEnv() first
 */
export function getEnv(): Env {
  if (!env) {
    return loadEnv();
  }
  return env;
}

/**
 * Parse business hours from env vars
 */
export function getBusinessHours() {
  const config = getEnv();
  const [startHour, startMin] = config.BUSINESS_HOURS_START.split(':').map(Number);
  const [endHour, endMin] = config.BUSINESS_HOURS_END.split(':').map(Number);
  const days = config.BUSINESS_DAYS.split(',').map(Number);
  
  return {
    start: { hour: startHour, minute: startMin },
    end: { hour: endHour, minute: endMin },
    days, // Array of day numbers (1=Monday, 7=Sunday)
    timezone: config.BUSINESS_TIMEZONE,
  };
}

