-- Images an AI app uploads through MCP (upload_image) wait in "files" until they are attached to
-- a note: expires_at says when an unattached upload is removed, name keeps its cleaned file name.
-- Additive and nullable, so the running server keeps working while this applies.
-- To undo: DROP INDEX "files_expires_idx"; ALTER TABLE "files" DROP COLUMN "expires_at", DROP COLUMN "name";
ALTER TABLE "files" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "files_expires_idx" ON "files" USING btree ("expires_at");
