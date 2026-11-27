CREATE TABLE "commerce"."room_upgrade_bookings" (
	"hotel_id" text,
	"booking_code" text,
	"room_number" text NOT NULL,
	"room_type_id" text NOT NULL,
	"status" text NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_out_at" timestamp with time zone NOT NULL,
	"guests" integer NOT NULL,
	"nights" jsonb NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_bookings_pkey" PRIMARY KEY("hotel_id","booking_code"),
	CONSTRAINT "ck_room_upgrade_bookings_values" CHECK ("is_mock" = true and "version" > 0 and "guests" > 0 and "check_out_at" > "check_in_at"),
	CONSTRAINT "ck_room_upgrade_bookings_status" CHECK ("status" in ('IN_HOUSE', 'CONFIRMED', 'CHECKED_OUT'))
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_hotels" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"fixture_version" text NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_room_upgrade_hotels_mock_version" CHECK ("is_mock" = true and "version" > 0)
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_member_benefits" (
	"hotel_id" text,
	"id" text,
	"booking_code" text NOT NULL,
	"code" text NOT NULL,
	"verified_at" timestamp with time zone,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"discount_bps" integer NOT NULL,
	"room_type_ids" jsonb NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_member_benefits_pkey" PRIMARY KEY("hotel_id","id"),
	CONSTRAINT "ck_room_upgrade_benefits_values" CHECK ("is_mock" = true and "version" > 0 and "discount_bps" between 0 and 10000 and "valid_until" > "valid_from")
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_policies" (
	"hotel_id" text,
	"code" text,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"rules" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1,
	CONSTRAINT "room_upgrade_policies_pkey" PRIMARY KEY("hotel_id","code","version"),
	CONSTRAINT "ck_room_upgrade_policies_values" CHECK ("is_mock" = true and "version" > 0 and "valid_until" > "valid_from")
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_inventory" (
	"hotel_id" text,
	"room_type_id" text,
	"date" date,
	"total" integer NOT NULL,
	"held" integer NOT NULL,
	"sold" integer NOT NULL,
	"out_of_service" integer NOT NULL,
	"stop_sell" boolean NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_inventory_pkey" PRIMARY KEY("hotel_id","room_type_id","date"),
	CONSTRAINT "ck_room_upgrade_inventory_values" CHECK ("is_mock" = true and "version" > 0 and "held" >= 0 and "sold" >= 0 and "out_of_service" >= 0 and "held" + "sold" + "out_of_service" <= "total")
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_rates" (
	"hotel_id" text,
	"room_type_id" text,
	"date" date,
	"price_vnd" bigint NOT NULL,
	"tax_included" boolean NOT NULL,
	"source_ref" text NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_rates_pkey" PRIMARY KEY("hotel_id","room_type_id","date"),
	CONSTRAINT "ck_room_upgrade_rates_values" CHECK ("is_mock" = true and "version" > 0 and "price_vnd" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_room_types" (
	"hotel_id" text,
	"id" text,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"max_guests" integer NOT NULL,
	"features" jsonb NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_room_types_pkey" PRIMARY KEY("hotel_id","id"),
	CONSTRAINT "ck_room_upgrade_room_types_values" CHECK ("is_mock" = true and "version" > 0 and "rank" > 0 and "max_guests" > 0)
);
--> statement-breakpoint
CREATE TABLE "commerce"."room_upgrade_staff_assignments" (
	"hotel_id" text,
	"user_id" uuid,
	"role" text NOT NULL,
	"active" boolean NOT NULL,
	"is_mock" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "room_upgrade_staff_assignments_pkey" PRIMARY KEY("hotel_id","user_id"),
	CONSTRAINT "ck_room_upgrade_staff_values" CHECK ("is_mock" = true and "version" > 0 and "role" in ('RECEPTIONIST', 'MANAGER'))
);
--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_bookings" ADD CONSTRAINT "room_upgrade_bookings_TAu5F50896yX_fkey" FOREIGN KEY ("hotel_id","room_type_id") REFERENCES "commerce"."room_upgrade_room_types"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_member_benefits" ADD CONSTRAINT "room_upgrade_member_benefits_VmWD5ku9JEdK_fkey" FOREIGN KEY ("hotel_id","booking_code") REFERENCES "commerce"."room_upgrade_bookings"("hotel_id","booking_code");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_policies" ADD CONSTRAINT "room_upgrade_policies_hotel_id_room_upgrade_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "commerce"."room_upgrade_hotels"("id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_inventory" ADD CONSTRAINT "room_upgrade_inventory_J14wOfLyaBzb_fkey" FOREIGN KEY ("hotel_id","room_type_id") REFERENCES "commerce"."room_upgrade_room_types"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_rates" ADD CONSTRAINT "room_upgrade_rates_eVnwyeLUrezg_fkey" FOREIGN KEY ("hotel_id","room_type_id") REFERENCES "commerce"."room_upgrade_room_types"("hotel_id","id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_room_types" ADD CONSTRAINT "room_upgrade_room_types_hotel_id_room_upgrade_hotels_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "commerce"."room_upgrade_hotels"("id");--> statement-breakpoint
ALTER TABLE "commerce"."room_upgrade_staff_assignments" ADD CONSTRAINT "room_upgrade_staff_assignments_xQ10FiwOPGB2_fkey" FOREIGN KEY ("hotel_id") REFERENCES "commerce"."room_upgrade_hotels"("id");