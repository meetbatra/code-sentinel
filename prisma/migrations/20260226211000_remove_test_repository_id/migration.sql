-- Remove redundant repository linkage from Test.
-- Tests are already scoped through jobId -> Job -> repositoryId.

ALTER TABLE "Test" DROP CONSTRAINT IF EXISTS "Test_repositoryId_fkey";
DROP INDEX IF EXISTS "Test_repositoryId_idx";
ALTER TABLE "Test" DROP COLUMN IF EXISTS "repositoryId";
