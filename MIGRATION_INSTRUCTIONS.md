# Database Migration Instructions

## Problem
The Supabase `Business` table structure doesn't match the Prisma schema, causing 400 Bad Request errors when trying to create or update businesses.

## Solution
Apply the migration to sync the database structure with the Prisma schema.

## Option A: Apply Migration via Prisma (Recommended)

### On Render (Production):
1. SSH into your Render service or use Render's shell
2. Run:
   ```bash
   npx prisma migrate deploy
   ```

This will apply all pending migrations to your Supabase database.

## Option B: Apply Migration Manually in Supabase

If you can't use Prisma migrate deploy, you can run the SQL manually:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of:
   `prisma/migrations/20251203100000_add_business_email_password/migration.sql`
3. Run the SQL script

## Option C: Use Prisma Migrate Dev (Local Development)

If you have DATABASE_URL set locally:
```bash
cd backend
npx prisma migrate dev
```

This will:
- Apply the migration
- Regenerate Prisma Client
- Update your local database

## Verification

After applying the migration, verify the Business table has:
- ✅ `id` (TEXT, PRIMARY KEY)
- ✅ `name` (TEXT, NOT NULL)
- ✅ `email` (TEXT, NOT NULL)
- ✅ `password` (TEXT, NOT NULL)
- ✅ `phoneNumber` (TEXT, NOT NULL, UNIQUE)
- ✅ `timezone` (TEXT, NOT NULL, DEFAULT 'Europe/Rome')
- ✅ `description` (TEXT, NULLABLE)
- ✅ `knowledgeBase` (JSONB, NULLABLE)
- ✅ `createdAt` (TIMESTAMP, NOT NULL)

## Important Notes

⚠️ **Existing Data**: If you have existing Business rows without email/password, the migration will set placeholder values. You should update these manually after the migration.

⚠️ **Production Safety**: The migration uses `IF NOT EXISTS` checks, so it's safe to run even if some columns already exist.

