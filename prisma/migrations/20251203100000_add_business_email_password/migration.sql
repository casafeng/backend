-- Migration: Add email and password to Business table
-- This migration ensures the Business table matches the Prisma schema

-- Step 1: Add email column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'email'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "email" TEXT;
    END IF;
END $$;

-- Step 2: Add password column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Business' AND column_name = 'password'
    ) THEN
        ALTER TABLE "Business" ADD COLUMN "password" TEXT;
    END IF;
END $$;

-- Step 3: Update any NULL values in existing rows
UPDATE "Business" 
SET 
    "email" = COALESCE("email", 'temp_' || "id" || '@placeholder.com')
WHERE "email" IS NULL;

UPDATE "Business" 
SET 
    "password" = COALESCE("password", '$2b$10$placeholder_hash_required_for_existing_rows')
WHERE "password" IS NULL;

-- Step 4: Make email NOT NULL
ALTER TABLE "Business" ALTER COLUMN "email" SET NOT NULL;

-- Step 5: Make password NOT NULL
ALTER TABLE "Business" ALTER COLUMN "password" SET NOT NULL;

-- Step 6: Ensure phoneNumber is NOT NULL (should already be, but ensure it)
ALTER TABLE "Business" ALTER COLUMN "phoneNumber" SET NOT NULL;

-- Step 7: Ensure timezone has correct default
ALTER TABLE "Business" ALTER COLUMN "timezone" SET DEFAULT 'Europe/Rome';

-- Step 8: Ensure unique constraint on phoneNumber exists
CREATE UNIQUE INDEX IF NOT EXISTS "Business_phoneNumber_key" ON "Business"("phoneNumber");
