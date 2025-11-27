# Technical Analysis: AI Receptionist Backend

## TASK 1: Current Project Snapshot

### 1. High-Level Architecture

**Components:**
- **Express Server** (`src/server/app.ts`): HTTP server with middleware for JSON parsing, raw body capture (for signature verification), request logging, error handling
- **Webhook Controller** (`src/controllers/voiceWebhook.ts`): Main entry point for `/webhooks/voice` POST requests
- **Prisma ORM** (`src/db/prisma.ts`): Singleton client for Supabase Postgres
- **Google Calendar Client** (`src/integrations/googleCalendar.ts`): Service account or OAuth2 auth, freebusy queries, event creation
- **OpenAI Client** (`src/integrations/openai.ts`): GPT-4o with function calling (checkAvailability, bookAppointment)
- **Twilio/Vapi Verification** (`src/integrations/twilio.ts`): HMAC signature verification for webhook security
- **Booking Service** (`src/services/bookingService.ts`): Business rules (30-min slots, business hours), availability checks, alternative slot finding
- **LLM Agent** (`src/services/llmAgent.ts`): Orchestrates OpenAI calls with tool execution loop
- **Call Log Service** (`src/services/callLogService.ts`): Persists CallLog and Appointment records

**Request Flow (Successful Booking):**
```
1. Vapi/Twilio → POST /webhooks/voice
   ├─ Headers: x-vapi-secret or x-vapi-signature + x-vapi-timestamp
   └─ Body: { to: "+12602869696", message: { toolCalls: [{ id, function: { name: "book_appointment", arguments: {...} } }] } }

2. voiceWebhook.ts::handleVoiceWebhook()
   ├─ Extract called number (req.body.to or req.body.phoneNumber.number)
   ├─ Lookup Business by phoneNumber → businessId
   ├─ Verify signature (Vapi HMAC or shared secret, OR Twilio HMAC-SHA1)
   ├─ Parse payload (normalizes multiple shapes: body.message.toolCalls, top-level toolCall, deep-scan)
   ├─ Extract appointment details (name, phone, email, date_time)
   ├─ Guard: reject past dates → return 200 with error message
   ├─ Create CallLog (with businessId)
   └─ Call processAppointmentRequestWithAlternatives()

3. llmAgent.ts::processAppointmentRequestWithAlternatives()
   ├─ If requestedDateTime exists:
   │  ├─ Parse to Date, compute end (start + 30min)
   │  ├─ checkAvailability(start, end) → bookingService.ts
   │  │  ├─ Validate business hours (isWithinBusinessHours)
   │  │  └─ checkSlotAvailability() → googleCalendar.ts (freebusy query)
   │  ├─ If available → bookAppointment()
   │  │  ├─ createCalendarEvent() → Google Calendar API
   │  │  ├─ prisma.appointment.create({ businessId, name, phone, email, start, end, googleEventId })
   │  │  └─ Return { message: "The appointment has been booked", status: "booked" }
   │  └─ If unavailable → findNextAvailableSlots(3) → return alternatives
   └─ Fallback: processAppointmentRequest() (LLM loop with tool calls)

4. voiceWebhook.ts (continued)
   ├─ updateCallLog() with status, bookedStart, bookedEnd, decisionReason
   └─ Return 200 JSON: { results: [{ toolCallId, result: "The appointment has been booked" }] }
```

### 2. Data Model

**Prisma Schema (`prisma/schema.prisma`):**

```prisma
model Business {
  id           String        @id @default(cuid())
  name         String
  phoneNumber  String        @unique  // Maps to dialed number
  timezone     String        @default("Europe/Rome")
  description  String?       // Optional free-text
  createdAt    DateTime      @default(now())
  appointments Appointment[]
  callLogs     CallLog[]
}

model Appointment {
  id            String    @id @default(cuid())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  businessId    String?   // Optional (nullable for backward compatibility)
  business      Business? @relation(fields: [businessId], references: [id])
  name          String
  phone         String?
  email         String?
  start         DateTime
  end           DateTime
  source        String    @default("twilio_vapi")
  calendarId    String?   // Google Calendar ID used
  googleEventId String?   // Google Calendar event ID (unique per event)
  callLogId     String?   // Reference to CallLog if created from a call

  @@index([start])
  @@index([googleEventId])
  @@index([callLogId])
  // NOTE: No unique constraint on googleEventId (could allow duplicates if retries happen)
}

model CallLog {
  id             String    @id @default(cuid())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  businessId     String?   // Optional (nullable for backward compatibility)
  business       Business? @relation(fields: [businessId], references: [id])
  callerPhone    String?
  callerName     String?
  email          String?
  requestedStart DateTime?
  requestedEnd   DateTime?
  bookedStart    DateTime?
  bookedEnd      DateTime?
  status         String    // "pending", "booked", "suggested_alternatives", "failed", "unavailable"
  decisionReason String?
  rawPayload     Json?     // Full webhook payload for debugging
  toolCallId     String?   // Vapi toolCallId for tracking

  @@index([status])
  @@index([createdAt])
  @@index([callerPhone])
  // NOTE: No unique constraint on toolCallId (no idempotency protection)
}
```

**businessId Usage:**
- **Business**: Primary key, referenced by `Appointment.businessId` and `CallLog.businessId`
- **Appointment**: Optional foreign key; if set, links appointment to a business
- **CallLog**: Optional foreign key; if set, links call to a business
- **Current behavior**: `businessId` is nullable, so existing rows without it continue to work. New calls populate it if Business lookup succeeds.

**Constraints & Indexes:**
- `Business.phoneNumber` is unique (one business per phone number)
- No unique constraint on `Appointment.googleEventId` (risk: duplicate bookings on retries)
- No unique constraint on `CallLog.toolCallId` (risk: duplicate logs if Vapi retries)
- Indexes on `Appointment.start`, `Appointment.googleEventId`, `CallLog.status`, `CallLog.createdAt`, `CallLog.callerPhone`

### 3. Webhook Behavior

**Validation:**
1. **Signature Verification** (`src/integrations/twilio.ts`):
   - Vapi: HMAC-SHA256 over `${timestamp}.${rawBody}` (header: `x-vapi-signature`, `x-vapi-timestamp`)
   - Fallback: Shared secret comparison (`x-vapi-secret` header) if HMAC headers missing
   - Twilio: HMAC-SHA1 over `${url}${rawBody}` (header: `x-twilio-signature`)
   - If neither configured → returns `true` (allows dev without secrets)
   - Clock tolerance: 5 minutes for Vapi timestamps

2. **Business Lookup**:
   - Extracts called number from `req.body.to`, `req.body.phoneNumber.number`, or `req.body.server.to`
   - Queries `Business` by `phoneNumber`
   - If not found → returns `200 { action: "hangup" }` (safe hangup, no error)

3. **Payload Normalization** (`parseRequest()`):
   - Supports 4 shapes:
     - `{ body: { message: { toolCalls: [...] } } }` (n8n-style)
     - `{ message: { toolCalls: [...] } }` (direct)
     - `{ toolCall: { id, name, arguments } }` (Vapi server-tool style)
     - Deep-scan fallback (recursively searches for `{ name, arguments }` object)
   - Normalizes `arguments` from snake_case (`name`, `date_time`, `phone_number`, `email`) to spaced keys (`Name`, `Date and Time`, `Phone Number`, `Email Address`)

4. **Decision Logic**:
   - **Past date guard**: If `requestedDateTime` parses to a date < now → returns `200` with message asking customer to confirm year
   - **Missing toolCalls**: If no `message.toolCalls` found → returns `200 "No tool calls to handle"` (soft handling for status updates)
   - **Missing name**: Returns `400 "Name is required"`
   - **Valid booking**: Proceeds to LLM agent → booking service → Google Calendar

**Idempotency:**
- **NOT implemented**. No deduplication by `toolCallId`:
  - If Vapi retries the same `toolCallId`, a new `CallLog` and potentially a new `Appointment` + Google Calendar event will be created
  - Risk: Duplicate bookings on network retries or Vapi retries

**Debug Logging:**
- In non-production: logs full `req.headers`, `req.body`, `x-vapi-secret` value, `VAPI_SIGNING_SECRET` value
- Console warnings for invalid signatures, missing headers, past dates
- Prisma query logging enabled in development

### 4. Current Limitations / Rough Edges

**Correctness Gaps:**
1. **No idempotency**: `toolCallId` is not unique; retries can create duplicate bookings
2. **businessId nullable**: Existing rows may have `NULL` businessId; no migration to backfill
3. **No per-business calendar**: All businesses share the same `GOOGLE_CALENDAR_ID` (env var, not per-business)
4. **No per-business timezone**: Business hours come from env vars (`BUSINESS_HOURS_START`, `BUSINESS_TIMEZONE`), not from `Business.timezone`
5. **No per-business business hours**: All businesses share the same hours (env vars)
6. **No unique constraint on googleEventId**: Could allow duplicate calendar events if retries happen
7. **Timezone handling**: `Business.timezone` exists but is not used; booking service uses `getBusinessHours()` which reads from env

**Scaling Concerns:**
1. **Single Google Calendar**: All businesses write to the same calendar (no per-business calendar mapping)
2. **Shared business hours**: All businesses share the same hours (no per-business configuration)
3. **No rate limiting**: Webhook endpoint has no rate limiting or abuse protection
4. **No request timeout**: Long-running LLM calls could hang the webhook
5. **No retry logic**: Google Calendar API calls have no retry/backoff (single attempt)
6. **No caching**: Business lookup happens on every request (minor, but could cache)

**Code Quality:**
- Extensive console.log in non-production (should be structured logging)
- Error messages are user-friendly but not always actionable
- No PII masking in logs (phone numbers, emails logged in plain text)

---

## TASK 2: Knowledge Base Evaluation

### 1. Feasibility: Adding Per-Business Knowledge Base

**✅ YES, it's feasible without breaking existing behavior.**

**Why it's safe:**
1. **Business lookup already exists**: The webhook already loads `Business` by `phoneNumber` → `businessId` is available early in the flow
2. **Optional injection point**: `processAppointmentRequest()` already accepts `businessContextPrompt?: string` (line 99 in `llmAgent.ts`), which is prepended to the user message (line 117). This is a non-breaking extension.
3. **No schema changes required for basic KB**: Can add JSON fields to `Business` model without affecting existing `Appointment`/`CallLog` rows
4. **Backward compatible**: If a business has no KB data, the system continues to work (current behavior: no KB = no injection)

**Risks:**
1. **LLM context size**: Large KBs could exceed token limits (mitigation: truncate or summarize)
2. **Prompt injection**: If KB contains user-generated content, risk of prompt injection attacks (mitigation: sanitize/validate)
3. **Performance**: Loading KB on every request adds a DB query (minor, but could cache)

### 2. Proposed Minimal KB Design

**Option A: JSON Field on Business (Simplest)**
```prisma
model Business {
  id           String        @id @default(cuid())
  name         String
  phoneNumber  String        @unique
  timezone     String        @default("Europe/Rome")
  description  String?
  knowledgeBase Json?        // NEW: Structured KB data
  createdAt    DateTime      @default(now())
  appointments Appointment[]
  callLogs     CallLog[]
}
```

**Option B: Separate KnowledgeBase Model (More Flexible)**
```prisma
model Business {
  id           String        @id @default(cuid())
  name         String
  phoneNumber  String        @unique
  timezone     String        @default("Europe/Rome")
  description  String?
  knowledgeBase KnowledgeBase? // NEW: One-to-one relation
  createdAt    DateTime      @default(now())
  appointments Appointment[]
  callLogs     CallLog[]
}

model KnowledgeBase {
  id          String   @id @default(cuid())
  businessId  String   @unique
  business    Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  // Structured fields (can be JSON or separate columns)
  hours       Json?    // { monday: { open: "09:00", close: "18:00" }, ... }
  menu        Json?    // { categories: [...], items: [...] }
  policies    Json?    // { cancellation: "...", groupBooking: "...", ... }
  faqs        Json?    // [{ question: "...", answer: "..." }, ...]
  customInfo  Json?    // Free-form business-specific info
  
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}
```

**Recommendation: Option A (JSON field)** for MVP:
- Simpler migration (add one nullable field)
- No join required (KB data loads with Business)
- Easy to extend later (can migrate to Option B if needed)
- Sufficient for structured data (hours, menu, FAQs, policies)

**TypeScript Type:**
```typescript
interface BusinessKnowledgeBase {
  hours?: {
    [day: string]: { open: string; close: string } | null; // "monday" -> { open: "09:00", close: "18:00" }
  };
  menu?: {
    categories?: Array<{ name: string; items: Array<{ name: string; price?: string; description?: string }> }>;
  };
  policies?: {
    cancellation?: string;
    groupBooking?: string;
    specialRequests?: string;
  };
  faqs?: Array<{ question: string; answer: string }>;
  customInfo?: Record<string, unknown>;
}
```

**Loading KB in Webhook:**
```typescript
// In voiceWebhook.ts, after business lookup:
const business = await prisma.business.findUnique({
  where: { phoneNumber: calledNumber },
  select: { id: true, name: true, timezone: true, knowledgeBase: true }, // Include KB
});

// Build KB prompt
const kbPrompt = business?.knowledgeBase 
  ? formatKnowledgeBasePrompt(business.knowledgeBase as BusinessKnowledgeBase)
  : undefined;

// Pass to LLM agent
const result = await processAppointmentRequestWithAlternatives({
  // ... existing params
  businessContextPrompt: kbPrompt, // This already exists in the code!
});
```

**Formatting KB for LLM:**
```typescript
function formatKnowledgeBasePrompt(kb: BusinessKnowledgeBase): string {
  const parts: string[] = [];
  
  if (kb.hours) {
    const hoursText = Object.entries(kb.hours)
      .filter(([_, val]) => val !== null)
      .map(([day, times]) => `${day}: ${times.open} - ${times.close}`)
      .join('\n');
    if (hoursText) parts.push(`Business Hours:\n${hoursText}`);
  }
  
  if (kb.menu) {
    // Format menu categories/items
    parts.push(`Menu: ${JSON.stringify(kb.menu, null, 2)}`);
  }
  
  if (kb.policies) {
    const policiesText = Object.entries(kb.policies)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    if (policiesText) parts.push(`Policies:\n${policiesText}`);
  }
  
  if (kb.faqs) {
    const faqsText = kb.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
    if (faqsText) parts.push(`Frequently Asked Questions:\n${faqsText}`);
  }
  
  if (kb.customInfo) {
    parts.push(`Additional Information: ${JSON.stringify(kb.customInfo, null, 2)}`);
  }
  
  return parts.length > 0 
    ? `You are the AI assistant for this business. Use the following knowledge base to answer customer questions:\n\n${parts.join('\n\n')}`
    : '';
}
```

**Compatibility with Multiple Assistants:**
- The KB is business-agnostic (just structured data)
- The LLM system prompt remains generic ("helpful assistant that can look up availability and book appointments")
- KB is injected as context, so the same LLM can handle restaurants, salons, etc. by loading different KBs
- If needed later, add `Business.assistantType` enum to customize system prompts per business type

### 3. Migration Strategy

**Prisma Migration:**
```prisma
// Add to Business model:
model Business {
  // ... existing fields
  knowledgeBase Json?  // NEW: nullable, so existing rows unaffected
}
```

**Migration SQL (generated by Prisma):**
```sql
ALTER TABLE "Business" ADD COLUMN "knowledgeBase" JSONB;
-- No data migration needed (all rows get NULL, which is fine)
```

**Impact on Existing Data:**
- ✅ **Zero breaking changes**: `knowledgeBase` is nullable, so existing `Business` rows continue to work
- ✅ **Existing bookings unaffected**: `Appointment` and `CallLog` models unchanged
- ✅ **Backward compatible**: If `business.knowledgeBase` is `NULL`, no KB prompt is injected (current behavior)

**Existing Flows Continue to Work:**
- ✅ Calls without KB: Business lookup succeeds, `knowledgeBase` is `NULL`, no KB prompt injected, booking proceeds normally
- ✅ Google Calendar integration: Unchanged (still uses `GOOGLE_CALENDAR_ID` from env)
- ✅ Booking logic: Unchanged (still uses env vars for business hours, timezone)

### 4. Step-by-Step Implementation Plan

**Step 1: Add Prisma Schema Field** ⚠️ **Safe/Isolated**
- Add `knowledgeBase Json?` to `Business` model
- Generate migration: `npx prisma migrate dev --name add_knowledge_base`
- Run migration (adds nullable column, no data changes)
- **Risk**: None (nullable field, no constraints)

**Step 2: Create KB Helper Functions** ✅ **Safe/Isolated**
- Create `src/services/knowledgeBaseService.ts`:
  - `formatKnowledgeBasePrompt(kb: BusinessKnowledgeBase): string`
  - `loadBusinessWithKB(phoneNumber: string): Promise<Business & { knowledgeBase?: BusinessKnowledgeBase }>`
- **Risk**: None (new file, no existing code touched)

**Step 3: Wire KB Loading in Webhook** ⚠️ **Touches Critical Path**
- In `voiceWebhook.ts`, after business lookup:
  - Change `prisma.business.findUnique()` to include `knowledgeBase` in select
  - Call `formatKnowledgeBasePrompt()` if `business.knowledgeBase` exists
  - Pass result to `processAppointmentRequestWithAlternatives({ businessContextPrompt: kbPrompt })`
- **Risk**: Low (KB prompt is optional; if `NULL`, behavior unchanged). Test with `NULL` KB first.

**Step 4: Add Type Definitions** ✅ **Safe/Isolated**
- Create `src/types/knowledgeBase.ts` with `BusinessKnowledgeBase` interface
- **Risk**: None (new types, no runtime impact)

**Step 5: Add Minimal Tests** ✅ **Safe/Isolated**
- Test `formatKnowledgeBasePrompt()` with sample KB data
- Test webhook with `knowledgeBase: null` (should work as before)
- Test webhook with `knowledgeBase: {...}` (should inject KB into prompt)
- **Risk**: None (tests are isolated)

**Step 6: Seed Sample KB Data** ✅ **Safe/Isolated**
- Create `scripts/seedKnowledgeBase.ts` to populate one Business with sample KB
- **Risk**: None (manual script, doesn't affect production)

**Order of Execution:**
1. Step 1 (Prisma schema + migration) → **Safe**
2. Step 4 (Type definitions) → **Safe**
3. Step 2 (Helper functions) → **Safe**
4. Step 3 (Wire into webhook) → **⚠️ Test thoroughly**
5. Step 5 (Tests) → **Safe**
6. Step 6 (Seed data) → **Safe**

**Testing Strategy:**
- Test 1: Call with Business that has `knowledgeBase: null` → should work exactly as before
- Test 2: Call with Business that has `knowledgeBase: {...}` → should inject KB into LLM prompt
- Test 3: Verify Google Calendar booking still works with KB enabled
- Test 4: Verify existing `Appointment`/`CallLog` rows unaffected

---

## Summary

### Current Status

The system is **production-ready for single-business use** with the following working features:
- ✅ Real phone calls via Vapi/Twilio with signature verification
- ✅ Multi-business routing by phone number (Business lookup, businessId propagation)
- ✅ Appointment booking with Google Calendar integration
- ✅ Call and appointment logging in Supabase
- ✅ Past-date guard and business hours validation
- ✅ Alternative slot suggestions when requested time unavailable

**Known gaps:**
- ❌ No idempotency (duplicate bookings possible on retries)
- ❌ No per-business calendar (all businesses share one Google Calendar)
- ❌ No per-business timezone/business hours (uses env vars)
- ❌ No Knowledge Base (restaurant info lives in Vapi system prompt)

### Recommended KB Design

**Minimal approach (MVP):**
- Add `knowledgeBase Json?` field to `Business` model
- Store structured data: `{ hours, menu, policies, faqs, customInfo }`
- Load KB with Business lookup in webhook
- Format as text prompt and inject via existing `businessContextPrompt` parameter
- **Zero breaking changes**: KB is optional; businesses without KB continue to work

**Future enhancements (post-MVP):**
- Migrate to separate `KnowledgeBase` model if needed
- Add per-business calendar mapping
- Add per-business timezone/business hours override
- Add KB versioning/audit trail
- Add KB admin UI/API

### Implementation Checklist

If you decide to implement the Knowledge Base:

- [ ] **Step 1**: Add `knowledgeBase Json?` to `Business` model in `prisma/schema.prisma`
- [ ] **Step 2**: Run `npx prisma migrate dev --name add_knowledge_base`
- [ ] **Step 3**: Create `src/types/knowledgeBase.ts` with `BusinessKnowledgeBase` interface
- [ ] **Step 4**: Create `src/services/knowledgeBaseService.ts` with `formatKnowledgeBasePrompt()` helper
- [ ] **Step 5**: Update `voiceWebhook.ts` to load `knowledgeBase` in Business query and pass to LLM agent
- [ ] **Step 6**: Test with `knowledgeBase: null` (should work as before)
- [ ] **Step 7**: Test with sample KB data (should inject into prompt)
- [ ] **Step 8**: Verify Google Calendar booking still works
- [ ] **Step 9**: (Optional) Create seed script to populate sample KB for one business
- [ ] **Step 10**: (Optional) Add unit tests for `formatKnowledgeBasePrompt()`

**Estimated effort**: 2-3 hours for MVP implementation + testing.

