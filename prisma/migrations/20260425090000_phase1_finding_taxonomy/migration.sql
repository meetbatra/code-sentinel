-- Create enums for finding taxonomy.
CREATE TYPE "FindingType" AS ENUM ('REPRODUCED_BUG', 'RUNTIME_RISK', 'CONFIG_GAP', 'CODE_QUALITY');
CREATE TYPE "ReproductionStatus" AS ENUM ('REPRODUCED', 'INFERRED', 'NOT_REPRODUCED');
CREATE TYPE "EvidenceType" AS ENUM ('EXECUTABLE_TEST', 'HTTP_RESPONSE', 'BROWSER_FLOW', 'SOURCE_ANALYSIS', 'MIXED');
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- Add finding/evidence fields to Bug.
ALTER TABLE "Bug"
  ADD COLUMN "findingType" "FindingType" NOT NULL DEFAULT 'REPRODUCED_BUG',
  ADD COLUMN "reproductionStatus" "ReproductionStatus" NOT NULL DEFAULT 'REPRODUCED',
  ADD COLUMN "evidenceType" "EvidenceType",
  ADD COLUMN "severity" "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "actualBehavior" TEXT,
  ADD COLUMN "expectedBehavior" TEXT,
  ADD COLUMN "reproductionSteps" JSONB,
  ADD COLUMN "evidenceSummary" TEXT,
  ADD COLUMN "counterEvidence" TEXT,
  ADD COLUMN "fallbackObserved" BOOLEAN,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reproCount" INTEGER NOT NULL DEFAULT 1;

-- Add indexes to support finding review and filtering.
CREATE INDEX "Bug_findingType_severity_createdAt_idx" ON "Bug"("findingType", "severity", "createdAt");
CREATE INDEX "Bug_reproductionStatus_evidenceType_createdAt_idx" ON "Bug"("reproductionStatus", "evidenceType", "createdAt");
