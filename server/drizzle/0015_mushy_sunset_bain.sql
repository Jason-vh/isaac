ALTER TABLE "share_tokens" ADD COLUMN "path" text;
UPDATE "share_tokens" SET "path" = '/dashboard' WHERE "path" IS NULL;
ALTER TABLE "share_tokens" ALTER COLUMN "path" SET NOT NULL;
