import { getEnv, getBusinessHours } from '../config/env';
import { checkSlotAvailability, findAvailableSlots, createCalendarEvent } from '../integrations/googleCalendar';
import { getPrismaClient } from '../db/prisma';
import { getCalendarId } from '../integrations/googleCalendar';

/**
 * Booking service
 * Implements business rules: 30-minute appointments, business hours, etc.
 * High-level orchestration of calendar operations
 */

/**
 * Check if a datetime is within business hours
 */
const WEEKDAY_MAP: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

function getDatePartsInBusinessTimezone(date: Date) {
  const hours = getBusinessHours();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Monday';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const normalizedWeekday = weekday.toLowerCase();
  const dayNumber =
    WEEKDAY_MAP[normalizedWeekday] ??
    WEEKDAY_MAP[normalizedWeekday.slice(0, 3)] ??
    1;

  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  return {
    dayNumber,
    hour,
    minute,
    timeInMinutes: hour * 60 + minute,
  };
}

export function isWithinBusinessHours(
  date: Date,
  options?: { allowEndBoundary?: boolean }
): boolean {
  const hours = getBusinessHours();
  const { dayNumber, timeInMinutes } = getDatePartsInBusinessTimezone(date);

  if (!hours.days.includes(dayNumber)) {
    return false;
  }

  const startInMinutes = hours.start.hour * 60 + hours.start.minute;
  const endInMinutes = hours.end.hour * 60 + hours.end.minute;

  if (options?.allowEndBoundary) {
    return timeInMinutes >= startInMinutes && timeInMinutes <= endInMinutes;
  }

  return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
}

/**
 * Normalize a start time to ensure the appointment fits within business hours
 * Returns the start time if valid, or null if it can't be adjusted
 */
export function normalizeAppointmentTime(
  start: Date,
  durationMinutes: number = 30
): Date | null {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  if (
    isWithinBusinessHours(start) &&
    isWithinBusinessHours(end, { allowEndBoundary: true })
  ) {
    return start;
  }

  return null;
}

/**
 * Compute end time from start time (default 30 minutes)
 */
export function computeEndTime(start: Date, durationMinutes?: number): Date {
  const duration = durationMinutes || getEnv().APPOINTMENT_DURATION_MINUTES;
  return new Date(start.getTime() + duration * 60 * 1000);
}

/**
 * Check if a time slot is available and valid
 */
export async function checkAvailability(
  start: Date,
  end: Date
): Promise<{ available: boolean; reason?: string }> {
  // Validate business hours
  if (!isWithinBusinessHours(start)) {
    return { available: false, reason: 'Outside business hours' };
  }
  
  if (!isWithinBusinessHours(end, { allowEndBoundary: true })) {
    return { available: false, reason: 'Appointment extends beyond business hours' };
  }
  
  // Check calendar availability
  const isAvailable = await checkSlotAvailability(start, end);
  
  return {
    available: isAvailable,
    reason: isAvailable ? undefined : 'Time slot is already booked',
  };
}

/**
 * Find the next N available appointment slots
 * Used when requested time is unavailable
 */
export async function findNextAvailableSlots(
  requestedStart: Date,
  count: number = 3,
  lookAheadDays: number = 60,
  candidateMultiplier: number = 10
): Promise<Date[]> {
  const hours = getBusinessHours();
  const requestedEnd = computeEndTime(requestedStart);
  const searchEnd = new Date(requestedStart);
  searchEnd.setDate(searchEnd.getDate() + lookAheadDays);
  
  // Find available slots starting from requested time
  const slots = await findAvailableSlots(
    requestedStart,
    searchEnd,
    getEnv().APPOINTMENT_DURATION_MINUTES,
    count * candidateMultiplier // gather enough raw slots before filtering
  );
  
  // Filter to only business hours and limit to count
  const validSlots: Date[] = [];
  for (const slot of slots) {
    if (validSlots.length >= count) break;
    
    const normalized = normalizeAppointmentTime(slot);
    if (normalized && isWithinBusinessHours(normalized)) {
      validSlots.push(normalized);
    }
  }
  
  return validSlots;
}

/**
 * Book an appointment
 * Creates calendar event and persists to database
 */
export interface BookAppointmentParams {
  start: Date;
  end: Date;
  name: string;
  phone?: string;
  email?: string;
  callLogId?: string;
  businessId?: string;
}

export interface BookedAppointment {
  id: string;
  googleEventId: string;
  start: Date;
  end: Date;
}

export async function bookAppointment(
  params: BookAppointmentParams
): Promise<BookedAppointment> {
  const prisma = getPrismaClient();
  
  // Validate availability
  const availability = await checkAvailability(params.start, params.end);
  if (!availability.available) {
    throw new Error(`Cannot book appointment: ${availability.reason}`);
  }
  
  // Create calendar event
  // Equivalent to Google Calendar node in n8n workflow
  const summary = `AI Receptionist Demo with ${params.name}`;
  const description = [
    params.name,
    params.phone ? `Phone: ${params.phone}` : '',
    params.email ? `Email: ${params.email}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  
  const calendarEvent = await createCalendarEvent({
    start: params.start,
    end: params.end,
    summary,
    description,
  });
  
  // Persist to database
  const appointment = await prisma.appointment.create({
    data: {
      businessId: params.businessId,
      name: params.name,
      phone: params.phone,
      email: params.email,
      start: params.start,
      end: params.end,
      source: 'twilio_vapi',
      calendarId: getCalendarId(),
      googleEventId: calendarEvent.id,
      callLogId: params.callLogId,
    },
  });
  
  return {
    id: appointment.id,
    googleEventId: calendarEvent.id,
    start: params.start,
    end: params.end,
  };
}

