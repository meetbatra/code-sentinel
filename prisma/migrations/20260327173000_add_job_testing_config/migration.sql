-- Add enums for persisted testing configuration.
CREATE TYPE "TestingMode" AS ENUM ('FAST', 'DEEP');
CREATE TYPE "TestingScope" AS ENUM ('AUTO', 'BACKEND_ONLY', 'FULL_STACK');

-- Persist run configuration on Job.
ALTER TABLE "Job"
  ADD COLUMN "testingMode" "TestingMode" NOT NULL DEFAULT 'FAST',
  ADD COLUMN "testingScope" "TestingScope" NOT NULL DEFAULT 'AUTO';
