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
 * Helper function to hide placeholder phone numbers from frontend
 * Placeholder phone numbers (starting with "pending-") are generated internally
 * but should not be shown to users - return null instead
 */
function sanitizeBusinessForResponse(business: {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  timezone: string;
  description: string | null;
  knowledgeBase: any;
  createdAt: Date;
}): {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  timezone: string;
  description: string | null;
  knowledgeBase: any;
  createdAt: Date;
} {
  const isPlaceholderPhone = business.phoneNumber.startsWith('pending-');
  return {
    ...business,
    phoneNumber: isPlaceholderPhone ? null : business.phoneNumber,
  };
}

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

    res.status(200).json(sanitizeBusinessForResponse(business));
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

    res.status(200).json(sanitizeBusinessForResponse(business));
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * PUT /admin/businesses/by-email/:email
 * Update business by email address
 */
export async function updateBusinessByEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.params;

    if (!email) {
      res.status(400).json({
        error: 'Email is required',
      });
      return;
    }

    // Validate request body
    const validatedData = businessUpdateSchema.parse(req.body);

    const decodedEmail = decodeURIComponent(email);
    const prisma = getPrismaClient();

    // Find business by email
    const existing = await prisma.business.findFirst({
      where: { email: decodedEmail },
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
      where: { id: existing.id },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.email && { email: validatedData.email }),
        ...(validatedData.phoneNumber && { phoneNumber: validatedData.phoneNumber }),
        ...(validatedData.timezone && { timezone: validatedData.timezone }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.knowledgeBase !== undefined && { knowledgeBase: validatedData.knowledgeBase }),
      },
    });

    // Return updated business (excluding password, hiding placeholder phone numbers)
    res.status(200).json(sanitizeBusinessForResponse(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    console.error('Update business by email error:', error);
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
        message: 'The business ID was not provided. After signup, use the "id" field from the response. Alternatively, use PUT /admin/businesses/by-email/:email if you have the email address.',
        hint: 'After POST /auth/business/signup, the response includes an "id" field. Store this ID and use it in subsequent requests.',
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

    // Return updated business (excluding password, hiding placeholder phone numbers)
    res.status(200).json(sanitizeBusinessForResponse(updated));
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

/**
 * Knowledge base update schema
 */
const knowledgeBaseUpdateSchema = z.object({
  knowledgeBase: z.record(z.any()).optional(),
});

/**
 * POST /admin/businesses/:id/kb
 * Update business knowledge base
 */
export async function updateKnowledgeBase(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
      });
      return;
    }

    // Validate request body
    const validatedData = knowledgeBaseUpdateSchema.parse(req.body);

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

    // Update knowledge base
    const updated = await prisma.business.update({
      where: { id },
      data: {
        knowledgeBase: validatedData.knowledgeBase !== undefined ? validatedData.knowledgeBase : undefined,
      },
    });

    // Return updated business (excluding password, hiding placeholder phone numbers)
    res.status(200).json(sanitizeBusinessForResponse(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    console.error('Update knowledge base error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * GET /admin/call-logs?businessId=...
 * Get call logs for a business (using query parameter)
 */
export async function getCallLogs(req: Request, res: Response): Promise<void> {
  try {
    const businessId = req.query.businessId as string;

    if (!businessId || businessId === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
        message: 'Provide businessId as a query parameter: /admin/call-logs?businessId=...',
      });
      return;
    }

    const prisma = getPrismaClient();

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    // Get call logs for this business
    const [callLogs, total] = await Promise.all([
      prisma.callLog.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit to most recent 100
      }),
      prisma.callLog.count({
        where: { businessId },
      }),
    ]);

    res.status(200).json({
      data: callLogs,
      total,
    });
  } catch (error) {
    console.error('Get call logs error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * GET /admin/businesses/:id/call-logs
 * Get call logs for a business (using path parameter - alternative route)
 */
export async function getCallLogsByPath(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
      });
      return;
    }

    const prisma = getPrismaClient();

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    // Get call logs for this business
    const [callLogs, total] = await Promise.all([
      prisma.callLog.findMany({
        where: { businessId: id },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit to most recent 100
      }),
      prisma.callLog.count({
        where: { businessId: id },
      }),
    ]);

    res.status(200).json({
      data: callLogs,
      total,
    });
  } catch (error) {
    console.error('Get call logs error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * GET /admin/appointments?businessId=...
 * Get appointments for a business (using query parameter)
 */
export async function getAppointments(req: Request, res: Response): Promise<void> {
  try {
    const businessId = req.query.businessId as string;

    if (!businessId || businessId === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
        message: 'Provide businessId as a query parameter: /admin/appointments?businessId=...',
      });
      return;
    }

    const prisma = getPrismaClient();

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    // Get appointments for this business
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where: { businessId },
        orderBy: { start: 'desc' },
        take: 100, // Limit to most recent 100
      }),
      prisma.appointment.count({
        where: { businessId },
      }),
    ]);

    res.status(200).json({
      data: appointments,
      total,
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

/**
 * GET /admin/businesses/:id/appointments
 * Get appointments for a business (using path parameter - alternative route)
 */
export async function getAppointmentsByPath(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || id === 'undefined') {
      res.status(400).json({
        error: 'Business ID is required',
      });
      return;
    }

    const prisma = getPrismaClient();

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      res.status(404).json({
        error: 'Business not found',
      });
      return;
    }

    // Get appointments for this business
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where: { businessId: id },
        orderBy: { start: 'desc' },
        take: 100, // Limit to most recent 100
      }),
      prisma.appointment.count({
        where: { businessId: id },
      }),
    ]);

    res.status(200).json({
      data: appointments,
      total,
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

