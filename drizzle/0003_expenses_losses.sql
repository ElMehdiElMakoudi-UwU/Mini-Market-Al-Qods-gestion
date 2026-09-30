CREATE TYPE "public"."expense_category" AS ENUM('RENT', 'ELECTRICITY', 'WATER', 'SALARY', 'PHONE_INTERNET', 'TRANSPORT', 'SUPPLIES', 'MAINTENANCE', 'TAXES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."loss_reason" AS ENUM('EXPIRED', 'BROKEN', 'STOLEN', 'DAMAGED', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'LOSS';--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"cash_session_id" integer,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "losses" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_cost" integer NOT NULL,
	"reason" "loss_reason" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "losses" ADD CONSTRAINT "losses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "losses" ADD CONSTRAINT "losses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "losses_created_at_idx" ON "losses" USING btree ("created_at");