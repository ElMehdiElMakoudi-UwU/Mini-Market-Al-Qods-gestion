CREATE TYPE "public"."stock_count_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'COUNT';--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"count_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"counted" double precision NOT NULL,
	"expected" double precision NOT NULL,
	"unit_cost" integer NOT NULL,
	"applied" double precision,
	"user_id" integer NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "stock_count_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"category_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"started_by_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_id" integer,
	"submitted_at" timestamp with time zone,
	"closed_by_id" integer,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_count_product_idx" ON "stock_count_lines" USING btree ("count_id","product_id");