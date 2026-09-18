ALTER TABLE "user" ADD COLUMN "hrisEmployeeId" varchar(255);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_hrisEmployeeId_unique" UNIQUE("hrisEmployeeId");
--> statement-breakpoint
DELETE FROM "session";
