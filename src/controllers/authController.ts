import { Request, Response } from 'express';
import { getPrismaClient } from '../db/prisma';
import { z } from 'zod';

/**
 * Business signup request schema
 */
const businessSignupSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  timezone: z.string().optional().default('America/New_York'),
  description: z.string().optional(),
  knowledgeBase: z.record(z.any()).optional(),
});

/**
 * POST /auth/business/signup
 * Create a new business account
 */
export async function businessSignup(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validatedData = businessSignupSchema.parse(req.body);

    const prisma = getPrismaClient();

    // Check if business with this phone number already exists
    const existing = await prisma.business.findUnique({
      where: { phoneNumber: validatedData.phoneNumber },
    });

    if (existing) {
      res.status(409).json({
        error: 'Business with this phone number already exists',
        businessId: existing.id,
      });
      return;
    }

    // Create new business
    const business = await prisma.business.create({
      data: {
        name: validatedData.name,
        phoneNumber: validatedData.phoneNumber,
        timezone: validatedData.timezone,
        description: validatedData.description,
        // Use undefined instead of null for optional JSON fields (Prisma v5+ requirement)
        knowledgeBase: validatedData.knowledgeBase,
      },
    });

    // Return created business (excluding sensitive fields if any)
    res.status(201).json({
      id: business.id,
      name: business.name,
      phoneNumber: business.phoneNumber,
      timezone: business.timezone,
      description: business.description,
      knowledgeBase: business.knowledgeBase,
      createdAt: business.createdAt,
    });
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

