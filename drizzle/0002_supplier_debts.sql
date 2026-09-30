CREATE TYPE "public"."supplier_entry_type" AS ENUM('OPENING', 'DELIVERY', 'PAYMENT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "supplier_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"type" "supplier_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"delivery_id" integer,
	"cash_session_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_entries" ADD CONSTRAINT "supplier_entries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_entries" ADD CONSTRAINT "supplier_entries_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_entries" ADD CONSTRAINT "supplier_entries_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_entries" ADD CONSTRAINT "supplier_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_entries_supplier_idx" ON "supplier_entries" USING btree ("supplier_id");