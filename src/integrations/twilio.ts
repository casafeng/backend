/**
 * Twilio/Vapi integration utilities
 * Handles webhook signature verification and request parsing
 */

import crypto from 'crypto';
import type { Request } from 'express';
import { getEnv } from '../config/env';

const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';
const VAPI_SIGNATURE_HEADER = 'x-vapi-signature';
const VAPI_TIMESTAMP_HEADER = 'x-vapi-timestamp';
const VAPI_SECRET_HEADER = 'x-vapi-secret';
const DEFAULT_CLOCK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

function timingSafeEqual(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function getRawBody(req: Request): string {
  const rawBody = (req as Request & { rawBody?: string }).rawBody;
  if (typeof rawBody === 'string') {
    return rawBody;
  }
  return req.body ? JSON.stringify(req.body) : '';
}

function getRequestUrl(req: Request): string {
  const protocol =
    (req.headers['x-forwarded-proto'] as string) ||
    req.protocol ||
    'https';
  const host = req.get('host');
  return `${protocol}://${host}${req.originalUrl}`;
}

/**
 * Verify Vapi webhook signature (if VAPI_SIGNING_SECRET is configured)
 * Assumes header names:
 * - x-vapi-signature
 * - x-vapi-timestamp
 * Algorithm: HMAC-SHA256 over `${timestamp}.${payload}`
 */
export function verifyVapiRequest(req: Request): boolean {
  const secret = getEnv().VAPI_SIGNING_SECRET;
  if (!secret) {
    console.warn('VAPI_SIGNING_SECRET not configured, skipping Vapi signature verification');
    return true;
  }

  const hmacSignature = req.header(VAPI_SIGNATURE_HEADER);
  const timestamp = req.header(VAPI_TIMESTAMP_HEADER);
  const sharedSecretHeader = req.header(VAPI_SECRET_HEADER);

  // If Vapi is configured with the older shared-secret header, fall back to that
  if (!hmacSignature && sharedSecretHeader) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Incoming x-vapi-secret:', sharedSecretHeader);
      console.log('VAPI_SIGNING_SECRET:', secret);
    }
    const matches = timingSafeEqual(sharedSecretHeader, secret);
    if (!matches) {
      console.warn('Invalid Vapi shared-secret header');
    }
    return matches;
  }

  if (!hmacSignature || !timestamp) {
    console.warn('Missing Vapi signature headers');
    return false;
  }

  const payload = getRawBody(req);
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const isValid = timingSafeEqual(expectedSignature, hmacSignature);
  if (!isValid) {
    console.warn('Invalid Vapi signature');
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    console.warn('Invalid Vapi timestamp');
    return false;
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > DEFAULT_CLOCK_TOLERANCE_MS) {
    console.warn('Vapi request timestamp outside tolerance window');
    return false;
  }

  return true;
}

/**
 * Verify Twilio webhook signature (if TWILIO_AUTH_TOKEN is configured)
 * See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * For JSON payloads we follow Twilio's guidance:
 *   signature = Base64( HMAC-SHA1( authToken, url + rawBody ) )
 */
export function verifyTwilioRequest(req: Request): boolean {
  const authToken = getEnv().TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('TWILIO_AUTH_TOKEN not configured, skipping Twilio signature verification');
    return true;
  }

  const signature = req.header(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    console.warn('Missing Twilio signature header');
    return false;
  }

  const url = getRequestUrl(req);
  const payload = getRawBody(req);
  const signedData = url + payload;
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(signedData)
    .digest('base64');

  const isValid = timingSafeEqual(expectedSignature, signature);
  if (!isValid) {
    console.warn('Invalid Twilio signature');
    return false;
  }

  return true;
}

