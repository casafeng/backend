import { Request, Response } from 'express';
import { getPrismaClient } from '../db/prisma';
import { z } from 'zod';

/**
 * Business update request schema
 */
const businessUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  timezone: z.string().optional(),
  description: z.string().optional(),
  knowledgeBase: z.record(z.any()).optional(),
});

/**
 * GET /admin/businesses/by-email/:email
 * Get business by email address
 */
export async function getBusinessByEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.params;

    if (!email) {
      res.status(400).json({
        error: 'Email is required',
      });
      return;
    }

    const decodedEmail = decodeURIComponent(email);
    const prisma = getPrismaClient();

    const business = await prisma.business.findFirst({
      where: { email: decodedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        timezone: true,
        description: true,
        knowledgeBase: true,
        createdAt: true,
      },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    res.status(200).json(business);
  } catch (error) {
    console.error('Get business by email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * GET /admin/businesses/:id
 * Get business by ID
 */
export async function getBusiness(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
      });
      return;
    }

    const prisma = getPrismaClient();

    const business = await prisma.business.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        timezone: true,
        description: true,
        knowledgeBase: true,
        createdAt: true,
        // Exclude password from response
      },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    res.status(200).json(business);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * PUT /admin/businesses/:id
 * Update business by ID
 */
export async function updateBusiness(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
      });
      return;
    }

    // Validate request body
    const validatedData = businessUpdateSchema.parse(req.body);

    const prisma = getPrismaClient();

    // Check if business exists
    const existing = await prisma.business.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    // Check if phoneNumber is being updated and if it conflicts
    if (validatedData.phoneNumber && validatedData.phoneNumber !== existing.phoneNumber) {
      const phoneConflict = await prisma.business.findUnique({
        where: { phoneNumber: validatedData.phoneNumber },
      });

      if (phoneConflict) {
        res.status(409).json({
          error: 'Phone number already in use by another business',
        });
        return;
      }
    }

    // Update business
    const updated = await prisma.business.update({
      where: { id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.email && { email: validatedData.email }),
        ...(validatedData.phoneNumber && { phoneNumber: validatedData.phoneNumber }),
        ...(validatedData.timezone && { timezone: validatedData.timezone }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.knowledgeBase !== undefined && { knowledgeBase: validatedData.knowledgeBase }),
      },
    });

    // Return updated business (excluding password)
    res.status(200).json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phoneNumber: updated.phoneNumber,
      timezone: updated.timezone,
      description: updated.description,
      knowledgeBase: updated.knowledgeBase,
      createdAt: updated.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    console.error('Update business error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

