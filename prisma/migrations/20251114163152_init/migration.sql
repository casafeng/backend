-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "callerPhone" TEXT,
    "callerName" TEXT,
    "email" TEXT,
    "requestedStart" TIMESTAMP(3),
    "requestedEnd" TIMESTAMP(3),
    "bookedStart" TIMESTAMP(3),
    "bookedEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "decisionReason" TEXT,
    "rawPayload" JSONB,
    "toolCallId" TEXT,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'twilio_vapi',
    "calendarId" TEXT,
    "googleEventId" TEXT,
    "callLogId" TEXT,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

-- CreateIndex
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- CreateIndex
CREATE INDEX "CallLog_callerPhone_idx" ON "CallLog"("callerPhone");

-- CreateIndex
CREATE INDEX "Appointment_start_idx" ON "Appointment"("start");

-- CreateIndex
CREATE INDEX "Appointment_googleEventId_idx" ON "Appointment"("googleEventId");

-- CreateIndex
CREATE INDEX "Appointment_callLogId_idx" ON "Appointment"("callLogId");
