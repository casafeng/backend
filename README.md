# AI Receptionist Backend

Production-ready backend service for an AI receptionist that handles phone calls 24/7. The service integrates with Twilio/Vapi for voice handling, OpenAI for natural language processing, Google Calendar for appointment management, and Supabase (Postgres) for data persistence.

## Features

- 🤖 **AI-Powered Receptionist**: Uses OpenAI GPT-4o with function calling to understand natural language appointment requests
- 📅 **Calendar Integration**: Checks availability and books appointments in Google Calendar
- 📞 **Voice Webhook Support**: Handles POST requests from Vapi/Twilio for real-time call processing
- 💾 **Data Persistence**: Logs all calls and appointments in Supabase (Postgres) via Prisma ORM
- ⏰ **Business Rules**: Enforces business hours, 30-minute appointment duration, and availability checks
- 🔄 **Smart Alternatives**: Automatically suggests next 3 available time slots when requested time is unavailable

## Architecture

The codebase follows a clean, modular architecture:

```
/src
  /config          - Environment variable validation
  /server          - Express app setup and routes
  /controllers     - Webhook handlers
  /services        - Business logic (LLM agent, booking, call logging)
  /integrations    - External API clients (OpenAI, Google Calendar, Twilio)
  /db              - Prisma client and database setup
  /types           - TypeScript type definitions
```

## Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL database (Supabase recommended)
- Google Calendar API credentials (Service Account or OAuth2)
- OpenAI API key
- Vapi/Twilio account (for production voice calls)

## Setup

1. **Clone and install dependencies:**

```bash
npm install
```

Or use the setup script (recommended):

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

2. **Set up environment variables:**

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `GOOGLE_CALENDAR_ID` - Your Google Calendar ID (email)
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account JSON (or OAuth2 credentials)
- `DATABASE_URL` - Supabase Postgres connection string

3. **Set up database:**

Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. **Start development server:**

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` env var).

## API Endpoints

### `POST /webhooks/voice`

Main webhook endpoint for Vapi/Twilio. Expects a payload in the format:

```json
{
  "body": {
    "message": {
      "toolCalls": [
        {
          "id": "tool-call-id",
          "function": {
            "name": "bookAppointment",
            "arguments": {
              "Name": "John Doe",
              "Phone Number": "+1234567890",
              "Date and Time": "2024-01-15T14:00:00-05:00",
              "Email Address": "john@example.com"
            }
          }
        }
      ]
    }
  }
}
```

Returns:

```json
{
  "results": [
    {
      "toolCallId": "tool-call-id",
      "result": "The appointment has been booked"
    }
  ]
}
```

### `GET /health`

Health check endpoint. Returns `{ "status": "ok", "timestamp": "..." }`.

## Security & Webhook Verification

- **Vapi**: Set `VAPI_SIGNING_SECRET`. Incoming requests must include:
  - `x-vapi-signature`: HMAC-SHA256 of `timestamp.payload`.
  - `x-vapi-timestamp`: Unix timestamp (seconds). Requests older than 5 minutes are rejected.
- **Twilio**: Set `TWILIO_AUTH_TOKEN`. The server validates `x-twilio-signature` per [Twilio’s webhook security spec](https://www.twilio.com/docs/usage/webhooks/webhooks-security) using the raw body + full request URL.
- If either signature is invalid, the API returns `401 Invalid webhook signature`.

> When running behind a proxy or edge network, be sure to forward the original protocol via `x-forwarded-proto` so the reconstructed URL matches what Twilio signed.

## How It Works

1. **Webhook Receives Request**: Vapi/Twilio sends a POST request with appointment details
2. **Call Log Created**: A `CallLog` entry is immediately created in the database
3. **LLM Agent Processes**: The AI agent:
   - Checks calendar availability for the requested time
   - If available: Books the appointment and confirms
   - If unavailable: Finds the next 3 closest available slots and suggests them
4. **Calendar Event Created**: If booking succeeds, an event is created in Google Calendar
5. **Database Updated**: `CallLog` is updated with results, and an `Appointment` record is created
6. **Response Sent**: Structured JSON response is returned to Vapi/Twilio

## Business Rules

- **Appointment Duration**: All appointments are exactly 30 minutes (configurable via `APPOINTMENT_DURATION_MINUTES`)
- **Business Hours**: Configurable via `BUSINESS_HOURS_START`, `BUSINESS_HOURS_END`, and `BUSINESS_DAYS`
- **Availability Check**: Always checks availability before booking
- **Alternative Suggestions**: When unavailable, suggests next 3 closest available slots

## Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Deployment

The codebase is provider-agnostic and can run on any Node.js environment. Suggested deployment options:

### Option 1: Railway / Render / Fly.io

Long-running Node.js server. Good for consistent performance.

1. Connect your Git repository
2. Set environment variables in the platform dashboard
3. Deploy

### Option 2: Supabase Edge Functions

Serverless HTTP handler. Good for cost efficiency.

1. Create a new Edge Function
2. Copy the webhook handler logic
3. Set environment variables in Supabase dashboard

### Option 3: Vercel / Cloud Run

Serverless HTTP API. Good for auto-scaling.

1. Deploy as a serverless function
2. Configure environment variables
3. Set up webhook URL in Vapi/Twilio

### Option 4: Docker

Containerized deployment for any platform.

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Environment Variables Reference

See `.env.example` for all available configuration options.

## Database Schema

### CallLog

Tracks all incoming calls and their outcomes:
- `callerPhone`, `callerName`, `email` - Caller information
- `requestedStart`, `requestedEnd` - Requested appointment time
- `bookedStart`, `bookedEnd` - Actually booked time (if successful)
- `status` - `booked`, `suggested_alternatives`, `failed`, `unavailable`
- `rawPayload` - Original webhook payload for debugging

### Appointment

Stores successfully booked appointments:
- `name`, `phone`, `email` - Contact information
- `start`, `end` - Appointment time
- `googleEventId` - Reference to Google Calendar event
- `callLogId` - Link to originating call log

### Business

Stores business information and routing:
- `name` - Business name
- `phoneNumber` - Unique phone number for routing calls
- `timezone` - Business timezone (default: Europe/Rome)
- `knowledgeBase` - JSON field for per-business knowledge (hours, menu, policies, etc.)

## Knowledge Base

Each business can have its own Knowledge Base stored in the `Business.knowledgeBase` JSON field. This information is automatically injected into the LLM context during calls, allowing the AI assistant to answer questions about business hours, menu items, policies, and more.

### Setting Up Knowledge Base in Supabase

1. **Open Supabase Dashboard** → Go to your project → Table Editor → `Business` table
2. **Select a Business row** → Click Edit
3. **In the `knowledgeBase` field**, paste a JSON object with the following structure:

```json
{
  "hours": {
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": null,
    "sunday": null
  },
  "address": "Via Roma 123, Milano, 20121",
  "menuHighlights": [
    "Pasta Carbonara",
    "Pizza Margherita",
    "Tiramisu",
    "Bruschetta al Pomodoro"
  ],
  "policies": {
    "cancellation": "Cancellazione gratuita fino a 24 ore prima della prenotazione",
    "groupBooking": "Prenotazioni di gruppo disponibili per 8+ persone. Contattare per dettagli",
    "specialRequests": "Accettiamo richieste speciali per allergie e preferenze dietetiche"
  },
  "faqs": [
    {
      "question": "Accettate carte di credito?",
      "answer": "Sì, accettiamo tutte le principali carte di credito e debito"
    },
    {
      "question": "Avete parcheggio?",
      "answer": "Sì, abbiamo un parcheggio privato disponibile per i clienti"
    }
  ],
  "notes": "Ristorante specializzato in cucina italiana tradizionale. Ambiente elegante, ideale per cene romantiche e occasioni speciali."
}
```

### Knowledge Base Fields

- **`hours`** (optional): Object mapping day names to `{ open: "HH:mm", close: "HH:mm" }` or `null` for closed days
- **`address`** (optional): Business address as a string
- **`menuHighlights`** (optional): Array of menu item names or highlights
- **`policies`** (optional): Object with policy keys (e.g., `cancellation`, `groupBooking`, `specialRequests`) and string values
- **`faqs`** (optional): Array of `{ question: string, answer: string }` objects
- **`notes`** (optional): Free-form additional information about the business

### How It Works

1. When a call arrives, the system looks up the `Business` by the dialed phone number
2. If `knowledgeBase` is present, it's formatted into Italian text and injected into the LLM context
3. The AI assistant can then answer questions about hours, menu, policies, etc. using this information
4. If `knowledgeBase` is `null` or empty, the system works normally without KB context

### Example: Restaurant Knowledge Base

```json
{
  "hours": {
    "monday": { "open": "12:00", "close": "22:00" },
    "tuesday": { "open": "12:00", "close": "22:00" },
    "wednesday": { "open": "12:00", "close": "22:00" },
    "thursday": { "open": "12:00", "close": "22:00" },
    "friday": { "open": "12:00", "close": "23:00" },
    "saturday": { "open": "12:00", "close": "23:00" },
    "sunday": { "open": "12:00", "close": "22:00" }
  },
  "address": "Via del Corso 45, Roma, 00186",
  "menuHighlights": [
    "Amatriciana",
    "Cacio e Pepe",
    "Saltimbocca alla Romana",
    "Gelato Artigianale"
  ],
  "policies": {
    "cancellation": "Cancellazione gratuita entro 2 ore dalla prenotazione",
    "groupBooking": "Gruppi di 6+ persone richiedono prenotazione anticipata"
  },
  "faqs": [
    {
      "question": "Fate delivery?",
      "answer": "Sì, offriamo delivery tramite le principali piattaforme"
    }
  ]
}
```

> **Note**: The Knowledge Base is optional. Businesses without a `knowledgeBase` will continue to work exactly as before, with no breaking changes.

## Development

### Project Structure

- **Services**: Business logic is separated into focused services:
  - `llmAgent.ts` - Orchestrates LLM calls and tool execution
  - `bookingService.ts` - Appointment booking rules and calendar operations
  - `callLogService.ts` - Database operations for call logging

- **Integrations**: External API clients are abstracted:
  - `openai.ts` - OpenAI client and tool definitions
  - `googleCalendar.ts` - Google Calendar API wrapper
  - `twilio.ts` - Webhook signature verification (placeholder)

### Adding New Features

1. **New Tool**: Add tool definition in `src/integrations/openai.ts` and implement handler in `src/services/llmAgent.ts`
2. **New Business Rule**: Extend `src/services/bookingService.ts`
3. **New Database Model**: Update `prisma/schema.prisma` and run migrations

## Troubleshooting

### Google Calendar Authentication

- **Service Account**: Ensure the service account has access to the calendar
- **OAuth2**: Make sure refresh token is valid and has calendar scope

### Database Connection

- Verify `DATABASE_URL` is correct
- Check Supabase connection pooling settings
- Ensure Prisma migrations have been run

### OpenAI API

- Verify API key is valid and has credits
- Check rate limits if seeing errors

## License

MIT

## Contributing

This is a production-ready codebase following best practices:
- TypeScript for type safety
- Prisma for database access
- Zod for environment validation
- Jest for testing
- Clean separation of concerns

For questions or issues, please open an issue in the repository.

