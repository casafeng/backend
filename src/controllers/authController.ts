import { Request, Response } from 'express';
import { getPrismaClient } from '../db/prisma';
import { z } from 'zod';
import bcrypt from 'bcrypt';

/**
 * Business signup request schema
 * Accepts minimal fields from frontend (name, email, password)
 * Optional fields (phoneNumber, timezone, description, knowledgeBase) use defaults
 */
const businessSignupSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  email: z.string().email('Valid email is required'), // Required - stored in database
  password: z.string().min(8, 'Password must be at least 8 characters'), // Required - hashed and stored
  phoneNumber: z.string().optional(), // Optional - will generate placeholder if missing
  timezone: z.string().optional(),
  description: z.string().optional(),
  knowledgeBase: z.record(z.any()).optional(),
});

/**
 * Generate a unique placeholder phone number for businesses without one
 */
function generatePlaceholderPhoneNumber(): string {
  // Generate a unique placeholder that won't conflict with real phone numbers
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `pending-${timestamp}-${random}`;
}

/**
 * POST /auth/business/signup
 * Create a new business account
 * Accepts minimal fields (name required, others optional with defaults)
 */
export async function businessSignup(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body - only name is required (enforced by Zod schema)
    const validatedData = businessSignupSchema.parse(req.body);

    const prisma = getPrismaClient();

    // Generate phoneNumber if not provided (required by schema, unique constraint)
    // Retry up to 5 times if placeholder collision occurs (extremely unlikely)
    let phoneNumber = validatedData.phoneNumber || generatePlaceholderPhoneNumber();
    let existing = await prisma.business.findUnique({
      where: { phoneNumber },
    });

    // Handle placeholder collision by generating a new one
    let retries = 0;
    while (existing && phoneNumber.startsWith('pending-') && retries < 5) {
      phoneNumber = generatePlaceholderPhoneNumber();
      existing = await prisma.business.findUnique({
        where: { phoneNumber },
      });
      retries++;
    }

    if (existing) {
      res.status(409).json({
        error: 'Business with this phone number already exists',
        businessId: existing.id,
      });
      return;
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create new business with defaults for optional fields
    const business = await prisma.business.create({
      data: {
        name: validatedData.name,
        email: validatedData.email, // Required field from database
        password: hashedPassword, // Hashed password
        phoneNumber,
        timezone: validatedData.timezone || 'America/New_York',
        description: validatedData.description,
        // Use undefined instead of null for optional JSON fields (Prisma v5+ requirement)
        knowledgeBase: validatedData.knowledgeBase,
      },
    });

    // Return created business (excluding sensitive fields if any)
    // Hide placeholder phone numbers from frontend - return null if it's a placeholder
    const isPlaceholderPhone = business.phoneNumber?.startsWith('pending-') ?? false;
    const response = {
      id: business.id,
      name: business.name,
      email: business.email,
      phoneNumber: isPlaceholderPhone ? null : business.phoneNumber, // Hide placeholder from frontend
      timezone: business.timezone,
      description: business.description,
      knowledgeBase: business.knowledgeBase,
      createdAt: business.createdAt,
    };

    // Log for debugging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Business signup successful:', {
        id: business.id,
        name: business.name,
        email: business.email,
        phoneNumber: isPlaceholderPhone ? '[placeholder hidden]' : business.phoneNumber,
      });
    }

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    console.error('Business signup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * Business login request schema
 */
const businessLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /auth/business/login
 * Authenticate business and return business data
 */
export async function businessLogin(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validatedData = businessLoginSchema.parse(req.body);

    const prisma = getPrismaClient();

    // Find business by email
    const business = await prisma.business.findFirst({
      where: { email: validatedData.email },
    });

    if (!business) {
      res.status(401).json({
        error: 'Invalid email or password',
      });
      return;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(validatedData.password, business.password);

    if (!passwordMatch) {
      res.status(401).json({
        error: 'Invalid email or password',
      });
      return;
    }

    // Hide placeholder phone numbers from frontend
    const isPlaceholderPhone = business.phoneNumber?.startsWith('pending-') ?? false;
    const response = {
      id: business.id,
      name: business.name,
      email: business.email,
      phoneNumber: isPlaceholderPhone ? null : business.phoneNumber,
      timezone: business.timezone,
      description: business.description,
      knowledgeBase: business.knowledgeBase,
      createdAt: business.createdAt,
    };

    // Log for debugging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Business login successful:', {
        id: business.id,
        name: business.name,
        email: business.email,
      });
    }

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    console.error('Business login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

