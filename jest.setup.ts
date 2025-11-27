// Jest setup file to provide required environment variables

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-openai-key';
process.env.GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'test-calendar@example.com';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/db';
process.env.BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE ?? 'America/New_York';
process.env.BUSINESS_HOURS_START = process.env.BUSINESS_HOURS_START ?? '09:00';
process.env.BUSINESS_HOURS_END = process.env.BUSINESS_HOURS_END ?? '18:00';
process.env.BUSINESS_DAYS = process.env.BUSINESS_DAYS ?? '1,2,3,4,5';
process.env.APPOINTMENT_DURATION_MINUTES = process.env.APPOINTMENT_DURATION_MINUTES ?? '30';

