import { 
  isWithinBusinessHours, 
  computeEndTime, 
  normalizeAppointmentTime 
} from '../bookingService';
import { loadEnv } from '../../config/env';

describe('bookingService', () => {
  describe('isWithinBusinessHours', () => {
    beforeEach(() => {
      // Mock env to have business hours 9-18, Mon-Fri
      process.env.BUSINESS_HOURS_START = '09:00';
      process.env.BUSINESS_HOURS_END = '18:00';
      process.env.BUSINESS_DAYS = '1,2,3,4,5';
      process.env.BUSINESS_TIMEZONE = 'America/New_York';
      loadEnv();
    });
    
    it('should return true for a time within business hours on a weekday', () => {
      const date = new Date('2024-01-15T14:00:00-05:00'); // Monday 2 PM
      expect(isWithinBusinessHours(date)).toBe(true);
    });
    
    it('should return false for a time before business hours', () => {
      const date = new Date('2024-01-15T08:00:00-05:00'); // Monday 8 AM
      expect(isWithinBusinessHours(date)).toBe(false);
    });
    
    it('should return false for a time after business hours', () => {
      const date = new Date('2024-01-15T19:00:00-05:00'); // Monday 7 PM
      expect(isWithinBusinessHours(date)).toBe(false);
    });
    
    it('should return false for a weekend day', () => {
      const date = new Date('2024-01-13T14:00:00-05:00'); // Saturday 2 PM
      expect(isWithinBusinessHours(date)).toBe(false);
    });

    it('should allow end boundary when option is set', () => {
      const closingTime = new Date('2024-01-15T18:00:00-05:00'); // Monday 6 PM
      expect(isWithinBusinessHours(closingTime, { allowEndBoundary: true })).toBe(true);
      expect(isWithinBusinessHours(closingTime)).toBe(false);
    });
  });
  
  describe('computeEndTime', () => {
    it('should add 30 minutes by default', () => {
      const start = new Date('2024-01-15T14:00:00Z');
      const end = computeEndTime(start);
      expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000);
    });
    
    it('should add custom duration', () => {
      const start = new Date('2024-01-15T14:00:00Z');
      const end = computeEndTime(start, 60);
      expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
    });
  });
  
  describe('normalizeAppointmentTime', () => {
    beforeEach(() => {
      process.env.BUSINESS_HOURS_START = '09:00';
      process.env.BUSINESS_HOURS_END = '18:00';
      process.env.BUSINESS_DAYS = '1,2,3,4,5';
      process.env.BUSINESS_TIMEZONE = 'America/New_York';
      loadEnv();
    });
    
    it('should return the same time if within business hours', () => {
      const start = new Date('2024-01-15T14:00:00-05:00'); // Monday 2 PM
      const normalized = normalizeAppointmentTime(start);
      expect(normalized?.getTime()).toBe(start.getTime());
    });
    
    it('should return null for weekend', () => {
      const start = new Date('2024-01-13T14:00:00-05:00'); // Saturday
      const normalized = normalizeAppointmentTime(start);
      expect(normalized).toBeNull();
    });
  });
});

