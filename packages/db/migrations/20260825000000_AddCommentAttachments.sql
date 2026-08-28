ALTER TABLE "card_attachment" ADD COLUMN "commentId" bigint;
--> statement-breakpoint
ALTER TABLE "card_attachment" ADD CONSTRAINT "card_attachment_commentId_card_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."card_comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "card_attachment_comment_idx" ON "card_attachment" USING btree ("commentId");
