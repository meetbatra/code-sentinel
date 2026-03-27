-- Add event type enum.
CREATE TYPE "JobEventType" AS ENUM ('STATUS', 'INFRA', 'DISCOVERY', 'SERVER', 'TEST_RESULT', 'BUG', 'SUMMARY', 'ERROR');

-- Add run metrics and cached counters to Job.
ALTER TABLE "Job"
  ADD COLUMN "setupDurationMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "testDurationMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "artifactUploadDurationMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalTests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passedTests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedTests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorTests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalBugs" INTEGER NOT NULL DEFAULT 0;

-- Add artifact metadata to Test.
ALTER TABLE "Test"
  ADD COLUMN "screenshotUploadedAt" TIMESTAMP(3),
  ADD COLUMN "screenshotUploadError" TEXT,
  ADD COLUMN "screenshotStorageProvider" TEXT;

-- Add fingerprint to Bug.
ALTER TABLE "Bug"
  ADD COLUMN "fingerprint" TEXT;

-- Create JobRunEvent timeline table.
CREATE TABLE "JobRunEvent" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "eventType" "JobEventType" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobRunEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobRunEvent"
  ADD CONSTRAINT "JobRunEvent_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes for query patterns.
CREATE INDEX "Job_testingScope_testingMode_status_createdAt_idx"
  ON "Job"("testingScope", "testingMode", "status", "createdAt");

CREATE INDEX "Test_type_createdAt_idx"
  ON "Test"("type", "createdAt");

CREATE INDEX "Test_featureName_idx"
  ON "Test"("featureName");

CREATE INDEX "Bug_affectedLayer_confidence_createdAt_idx"
  ON "Bug"("affectedLayer", "confidence", "createdAt");

CREATE INDEX "Bug_fingerprint_idx"
  ON "Bug"("fingerprint");

CREATE INDEX "JobRunEvent_jobId_createdAt_idx"
  ON "JobRunEvent"("jobId", "createdAt");

CREATE INDEX "JobRunEvent_eventType_createdAt_idx"
  ON "JobRunEvent"("eventType", "createdAt");
