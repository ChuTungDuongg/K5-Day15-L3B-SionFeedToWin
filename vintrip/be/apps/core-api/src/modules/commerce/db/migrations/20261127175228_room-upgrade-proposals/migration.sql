CREATE TABLE "commerce"."room_upgrade_proposal_audit_events" (
	"id" uuid PRIMARY KEY,
	"hotel_id" text NOT NULL,
	"proposal_id" uuid NOT NULL,
	"proposal_version" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"previous_status" text,
	"new_status" text NOT NULL,
	"reason" text,
	"reason_codes" jsonb DEFAULT '[]' NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ck_room_upgrade_audit_values" CHECK ("is_mock" = true and "proposal_version" > 0 and "revision_number" > 0),
	CONSTRAINT "ck_room_upgrade_audit_action" CHECK ("action" in ('CREATED', 'REVISED', 'APPROVED', 'REJECTED', 'ESCALATED', 'MARKED_EXPIRED', 'MARKED_REQUOTE_REQUIRED')),
	CONSTRAINT "ck_room_upgrade_audit_roles_status" CHECK ("actor_role" in ('RECEPTIONIST', 'MANAGER') and ("previous_status" is null or "previous_status" in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED')) and "new_status" in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED'))
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_proposal_idempotency" (
	"hotel_id" text,
	"actor_user_id" uuid,
	"operation" text,
	"target_id" text,
	"idempotency_key" text,
	"payload_hash" text NOT NULL,
	"proposal_id" uuid NOT NULL,
	"http_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	CONSTRAINT "room_upgrade_proposal_idempotency_pkey" PRIMARY KEY("hotel_id","actor_user_id","operation","target_id","idempotency_key"),
	CONSTRAINT "ck_room_upgrade_idempotency_values" CHECK ("is_mock" = true and "http_status" in (200, 201, 409) and "operation" in ('CREATE', 'REVISE', 'APPROVE', 'REJECT', 'ESCALATE'))
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_proposal_revisions" (
	"hotel_id" text NOT NULL,
	"proposal_id" uuid,
	"revision_number" integer,
	"normalized_request" jsonb NOT NULL,
	"target_room_type_id" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"quote" jsonb NOT NULL,
	"breakdown" jsonb NOT NULL,
	"policy_sources" jsonb NOT NULL,
	"policy_code" text NOT NULL,
	"policy_version" integer NOT NULL,
	"fixture_version" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"business_fingerprint" text NOT NULL,
	"price_diff_vnd" bigint NOT NULL,
	"quote_status" text NOT NULL,
	"required_approval_role" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ai_metadata" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	CONSTRAINT "room_upgrade_proposal_revisions_pkey" PRIMARY KEY("proposal_id","revision_number"),
	CONSTRAINT "ck_room_upgrade_revisions_values" CHECK ("is_mock" = true and "revision_number" > 0 and "policy_version" > 0 and "price_diff_vnd" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "ck_room_upgrade_revisions_status" CHECK ("quote_status" in ('VALID', 'REQUIRES_MANAGER') and "required_approval_role" in ('RECEPTIONIST', 'MANAGER'))
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_proposals" (
	"id" uuid PRIMARY KEY,
	"hotel_id" text NOT NULL,
	"booking_code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"required_approval_role" text NOT NULL,
	"reason_codes" jsonb DEFAULT '[]' NOT NULL,
	"decided_by" uuid,
	"decided_by_role" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_room_upgrade_proposals_hotel_id" UNIQUE("hotel_id","id"),
	CONSTRAINT "ck_room_upgrade_proposals_values" CHECK ("is_mock" = true and "version" > 0 and "current_revision" > 0 and "version" >= "current_revision"),
	CONSTRAINT "ck_room_upgrade_proposals_status" CHECK ("status" in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED')),
	CONSTRAINT "ck_room_upgrade_proposals_role" CHECK ("required_approval_role" in ('RECEPTIONIST', 'MANAGER') and ("decided_by_role" is null or "decided_by_role" in ('RECEPTIONIST', 'MANAGER')))
);
--> statement-breakpoint
CREATE INDEX "idx_room_upgrade_audit_history" ON "commerce"."room_upgrade_proposal_audit_events" ("hotel_id","proposal_id","created_at","proposal_version");--> statement-breakpoint
CREATE INDEX "idx_room_upgrade_revisions_hotel_proposal" ON "commerce"."room_upgrade_proposal_revisions" ("hotel_id","proposal_id","revision_number");--> statement-breakpoint
CREATE INDEX "idx_room_upgrade_proposals_queue" ON "commerce"."room_upgrade_proposals" ("hotel_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_room_upgrade_proposals_booking" ON "commerce"."room_upgrade_proposals" ("hotel_id","booking_code","created_at");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposal_audit_events" ADD CONSTRAINT "fk_room_upgrade_audit_proposal" FOREIGN KEY ("hotel_id","proposal_id") REFERENCES "commerce"."room_upgrade_proposals"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposal_idempotency" ADD CONSTRAINT "room_upgrade_proposal_idempotency_ZUzuUFRd8T5X_fkey" FOREIGN KEY ("hotel_id") REFERENCES "commerce"."room_upgrade_hotels"("id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposal_idempotency" ADD CONSTRAINT "fk_room_upgrade_idempotency_proposal" FOREIGN KEY ("hotel_id","proposal_id") REFERENCES "commerce"."room_upgrade_proposals"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposal_revisions" ADD CONSTRAINT "fk_room_upgrade_revisions_proposal" FOREIGN KEY ("hotel_id","proposal_id") REFERENCES "commerce"."room_upgrade_proposals"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposal_revisions" ADD CONSTRAINT "fk_room_upgrade_revisions_target_room" FOREIGN KEY ("hotel_id","target_room_type_id") REFERENCES "commerce"."room_upgrade_room_types"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_proposals" ADD CONSTRAINT "fk_room_upgrade_proposals_booking" FOREIGN KEY ("hotel_id","booking_code") REFERENCES "commerce"."room_upgrade_bookings"("hotel_id","booking_code");