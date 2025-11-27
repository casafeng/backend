import { google, calendar_v3 } from 'googleapis';
import { getEnv } from '../config/env';

/**
 * Google Calendar integration
 * Supports both service account and OAuth2 authentication
 * Equivalent to Google Calendar nodes in AI_Receptionist_Agent (1).json
 */

let calendarClient: calendar_v3.Calendar | null = null;

function parseServiceAccountJSON(rawValue: string) {
  const attempts: string[] = [];
  const trimmed = rawValue.trim();
  attempts.push(trimmed);

  // Attempt to sanitize literal newlines (when value pasted with real line breaks)
  const sanitizedNewlines = trimmed
    .replace(/\r/g, '')
    .replace(/(?<!\\)\n/g, '\\n');
  if (sanitizedNewlines !== trimmed) {
    attempts.push(sanitizedNewlines);
  }

  // If looks like base64, try decoding
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (base64Regex.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      attempts.push(decoded);
    } catch {
      // ignore
    }
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }

  throw new Error(
    'Invalid GOOGLE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON, single-line with escaped quotes/newlines, or base64 encoded.'
  );
}

function resolveServiceAccountCredentials(config: ReturnType<typeof getEnv>) {
  let rawValue: string | undefined;

  if (config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    try {
      rawValue = Buffer.from(
        config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
        'base64'
      ).toString('utf8');
    } catch (error) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64.');
    }
  } else {
    rawValue = config.GOOGLE_SERVICE_ACCOUNT_JSON;
  }

  if (!rawValue) {
    throw new Error('Google service account credentials not configured.');
  }

  return parseServiceAccountJSON(rawValue);
}

/**
 * Initialize Google Calendar client
 * Supports service account (GOOGLE_SERVICE_ACCOUNT_JSON) or OAuth2
 */
export function getCalendarClient(): calendar_v3.Calendar {
  if (!calendarClient) {
    const config = getEnv();
    
    let auth;
    
    // Prefer service account if provided
    if (config.GOOGLE_SERVICE_ACCOUNT_JSON || config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
      const serviceAccount = resolveServiceAccountCredentials(config);
      auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
    } else if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN) {
      // OAuth2 flow
      auth = new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials({
        refresh_token: config.GOOGLE_REFRESH_TOKEN,
      });
    } else {
      throw new Error(
        'Google Calendar authentication not configured. ' +
        'Provide either GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN'
      );
    }
    
    calendarClient = google.calendar({ version: 'v3', auth });
  }
  
  return calendarClient;
}

/**
 * Get the configured calendar ID
 */
export function getCalendarId(): string {
  return getEnv().GOOGLE_CALENDAR_ID;
}

/**
 * Check if a time slot is available
 * Equivalent to Google Calendar1 node (availability check) in n8n workflow
 * Uses freebusy query or event list with timeMin/timeMax
 */
export async function checkSlotAvailability(
  start: Date,
  end: Date
): Promise<boolean> {
  const client = getCalendarClient();
  const calendarId = getCalendarId();
  
  try {
    // Use freebusy query for efficient availability checking
    const response = await client.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    
    const busy = response.data.calendars?.[calendarId]?.busy || [];
    return busy.length === 0;
  } catch (error) {
    console.error('Error checking calendar availability:', error);
    throw new Error('Failed to check calendar availability');
  }
}

/**
 * Create a calendar event
 * Equivalent to Google Calendar node (create event) in n8n workflow
 */
export interface CreateEventParams {
  start: Date;
  end: Date;
  summary: string;
  description: string;
}

export interface CreatedEvent {
  id: string;
  htmlLink?: string;
  start?: string;
  end?: string;
}

export async function createCalendarEvent(
  params: CreateEventParams
): Promise<CreatedEvent> {
  const client = getCalendarClient();
  const calendarId = getCalendarId();
  
  try {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: params.start.toISOString(),
        timeZone: getEnv().BUSINESS_TIMEZONE,
      },
      end: {
        dateTime: params.end.toISOString(),
        timeZone: getEnv().BUSINESS_TIMEZONE,
      },
    };
    
    const response = await client.events.insert({
      calendarId,
      requestBody: event,
    });
    
    return {
      id: response.data.id || '',
      htmlLink: response.data.htmlLink || undefined,
      start: response.data.start?.dateTime || undefined,
      end: response.data.end?.dateTime || undefined,
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw new Error('Failed to create calendar event');
  }
}

/**
 * Find available time slots within a date range
 * Used to suggest alternatives when requested time is unavailable
 */
export async function findAvailableSlots(
  startDate: Date,
  endDate: Date,
  durationMinutes: number,
  maxResults: number = 3
): Promise<Date[]> {
  const client = getCalendarClient();
  const calendarId = getCalendarId();
  
  try {
    // Get all busy periods in the range
    const response = await client.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    
    const busy = response.data.calendars?.[calendarId]?.busy || [];
    const availableSlots: Date[] = [];
    
    // Simple algorithm: check every 30 minutes starting from startDate
    let currentTime = new Date(startDate);
    const endTime = new Date(endDate);
    const slotDuration = durationMinutes * 60 * 1000; // milliseconds
    
    while (currentTime.getTime() + slotDuration <= endTime.getTime() && availableSlots.length < maxResults) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration);
      
      // Check if this slot overlaps with any busy period
      const isAvailable = !busy.some(busyPeriod => {
        const busyStart = new Date(busyPeriod.start || '');
        const busyEnd = new Date(busyPeriod.end || '');
        return (
          (currentTime >= busyStart && currentTime < busyEnd) ||
          (slotEnd > busyStart && slotEnd <= busyEnd) ||
          (currentTime <= busyStart && slotEnd >= busyEnd)
        );
      });
      
      if (isAvailable) {
        availableSlots.push(new Date(currentTime));
      }
      
      // Move to next 30-minute slot
      currentTime = new Date(currentTime.getTime() + slotDuration);
    }
    
    return availableSlots;
  } catch (error) {
    console.error('Error finding available slots:', error);
    throw new Error('Failed to find available slots');
  }
}

