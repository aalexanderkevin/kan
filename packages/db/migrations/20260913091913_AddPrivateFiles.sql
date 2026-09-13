CREATE TYPE "public"."private_room_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_file_activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"roomId" bigint NOT NULL,
	"action" varchar(80) NOT NULL,
	"subjectPublicId" varchar(12),
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "private_file_activity_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "private_file_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_file" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"roomId" bigint NOT NULL,
	"filename" varchar(255) NOT NULL,
	"contentType" varchar(255) NOT NULL,
	"size" integer NOT NULL,
	"bucket" text NOT NULL,
	"storageKey" text NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"confirmedAt" timestamp,
	"deletedAt" timestamp,
	CONSTRAINT "private_file_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "private_file_storageKey_unique" UNIQUE("storageKey")
);
--> statement-breakpoint
ALTER TABLE "private_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_room_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"roomId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	"role" "private_room_role" NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	CONSTRAINT "private_room_member_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "private_room_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_room" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	CONSTRAINT "private_room_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "private_room" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_file_activity" ADD CONSTRAINT "private_file_activity_roomId_private_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."private_room"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_file_activity" ADD CONSTRAINT "private_file_activity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_file" ADD CONSTRAINT "private_file_roomId_private_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."private_room"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_file" ADD CONSTRAINT "private_file_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_room_member" ADD CONSTRAINT "private_room_member_roomId_private_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."private_room"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_room_member" ADD CONSTRAINT "private_room_member_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_room_member" ADD CONSTRAINT "private_room_member_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_room" ADD CONSTRAINT "private_room_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_room" ADD CONSTRAINT "private_room_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_file_activity_room_idx" ON "private_file_activity" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_file_room_idx" ON "private_file" USING btree ("roomId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "private_room_active_member_idx" ON "private_room_member" USING btree ("roomId","workspaceMemberId") WHERE "private_room_member"."deletedAt" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "private_room_owner_idx" ON "private_room_member" USING btree ("roomId") WHERE "private_room_member"."deletedAt" IS NULL AND "private_room_member"."role" = 'owner';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_room_member_workspace_member_idx" ON "private_room_member" USING btree ("workspaceMemberId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_room_workspace_idx" ON "private_room" USING btree ("workspaceId");--> statement-breakpoint
-- Revoke at the database boundary so every membership update path (including
-- billing pauses and account removal) invalidates grants in the same transaction.
CREATE FUNCTION revoke_private_room_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'active' OR NEW."deletedAt" IS NOT NULL
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    WITH revoked AS (
      UPDATE "private_room_member"
      SET "deletedAt" = now(), "updatedAt" = now()
      WHERE "workspaceMemberId" = NEW."id" AND "deletedAt" IS NULL
      RETURNING "roomId"
    )
    INSERT INTO "private_file_activity" ("publicId", "roomId", "action", "subjectPublicId", "createdBy")
    SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 12),
           "roomId", 'member.workspace_access_revoked', NEW."publicId", NEW."deletedBy"
    FROM revoked;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workspace_member_revoke_private_rooms
AFTER UPDATE OF "status", "deletedAt", "userId", "workspaceId" ON "workspace_members"
FOR EACH ROW EXECUTE FUNCTION revoke_private_room_access();
