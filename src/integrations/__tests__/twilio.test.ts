import crypto from 'crypto';
import type { Request } from 'express';
import { verifyVapiRequest, verifyTwilioRequest } from '../twilio';
import { loadEnv } from '../../config/env';

type MockReqOptions = {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  url?: string;
  protocol?: string;
};

function createMockRequest(options: MockReqOptions = {}): Request {
  const headers: Record<string, string> = {};
  Object.entries(options.headers || {}).forEach(([key, value]) => {
    headers[key.toLowerCase()] = value;
  });

  const req = {
    body: options.body ?? {},
    headers,
    rawBody: options.rawBody,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    originalUrl: options.url ?? '/webhooks/voice',
    protocol: options.protocol ?? 'https',
  } as unknown as Request & { rawBody?: string };

  return req;
}

describe('twilio integration verification helpers', () => {
  beforeEach(() => {
    process.env.VAPI_SIGNING_SECRET = 'test-vapi-secret';
    process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
    process.env.NODE_ENV = 'test';
    loadEnv();
  });

  describe('verifyVapiRequest', () => {
    it('returns true for valid signature', () => {
      const payload = JSON.stringify({ hello: 'world' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = crypto
        .createHmac('sha256', process.env.VAPI_SIGNING_SECRET!)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      const req = createMockRequest({
        rawBody: payload,
        headers: {
          'x-vapi-signature': signature,
          'x-vapi-timestamp': timestamp,
        },
      });

      expect(verifyVapiRequest(req)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const payload = JSON.stringify({ hello: 'world' });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const req = createMockRequest({
        rawBody: payload,
        headers: {
          'x-vapi-signature': 'invalid',
          'x-vapi-timestamp': timestamp,
        },
      });

      expect(verifyVapiRequest(req)).toBe(false);
    });
    it('falls back to shared-secret header when signature missing', () => {
      const req = createMockRequest({
        headers: {
          'x-vapi-secret': process.env.VAPI_SIGNING_SECRET!,
        },
      });

      expect(verifyVapiRequest(req)).toBe(true);
    });

    it('rejects invalid shared-secret header', () => {
      const req = createMockRequest({
        headers: {
          'x-vapi-secret': 'wrong',
        },
      });

      expect(verifyVapiRequest(req)).toBe(false);
    });
  });

  describe('verifyTwilioRequest', () => {
    it('returns true for valid signature', () => {
      const payload = JSON.stringify({ hi: 'there' });
      const url = 'https://example.com/webhooks/voice';
      const signature = crypto
        .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!)
        .update(url + payload)
        .digest('base64');

      const req = createMockRequest({
        rawBody: payload,
        headers: {
          host: 'example.com',
          'x-twilio-signature': signature,
        },
        url: '/webhooks/voice',
        protocol: 'https',
      });

      expect(verifyTwilioRequest(req)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const payload = JSON.stringify({ hi: 'there' });

      const req = createMockRequest({
        rawBody: payload,
        headers: {
          host: 'example.com',
          'x-twilio-signature': 'invalid',
        },
        url: '/webhooks/voice',
        protocol: 'https',
      });

      expect(verifyTwilioRequest(req)).toBe(false);
    });
  });
});

