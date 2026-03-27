-- Create enums for test layer and bug affected layer.
CREATE TYPE "TestLayer" AS ENUM ('BACKEND', 'FULL_STACK');
CREATE TYPE "AffectedLayer" AS ENUM ('FRONTEND', 'BACKEND', 'BOTH');

-- Convert Test.type text values to enum values.
ALTER TABLE "Test"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "TestLayer"
  USING CASE
    WHEN LOWER("type") = 'full-stack' THEN 'FULL_STACK'::"TestLayer"
    ELSE 'BACKEND'::"TestLayer"
  END,
  ALTER COLUMN "type" SET DEFAULT 'BACKEND';

-- Convert Bug.affectedLayer text values to enum values.
ALTER TABLE "Bug"
  ALTER COLUMN "affectedLayer" TYPE "AffectedLayer"
  USING CASE
    WHEN "affectedLayer" IS NULL THEN NULL
    WHEN LOWER("affectedLayer") = 'frontend' THEN 'FRONTEND'::"AffectedLayer"
    WHEN LOWER("affectedLayer") = 'backend' THEN 'BACKEND'::"AffectedLayer"
    WHEN LOWER("affectedLayer") = 'both' THEN 'BOTH'::"AffectedLayer"
    ELSE NULL
  END;
