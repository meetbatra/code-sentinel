-- Add full-stack test metadata fields to Test.
ALTER TABLE "Test"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'backend',
  ADD COLUMN "featureName" TEXT,
  ADD COLUMN "steps" JSONB,
  ADD COLUMN "screenshotUrl" TEXT,
  ADD COLUMN "networkAssertions" JSONB,
  ADD COLUMN "uiAssertions" JSONB;

-- Add affectedLayer to Bug.
ALTER TABLE "Bug"
  ADD COLUMN "affectedLayer" TEXT;
