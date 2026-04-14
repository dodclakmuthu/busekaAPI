-- This migration was generated from local schema drift. On fresh databases,
-- the index may not exist yet, so keep this step idempotent.
DROP INDEX IF EXISTS "Route_companyId_sourceType_idx";
