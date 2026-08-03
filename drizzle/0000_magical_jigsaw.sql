CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"month" text NOT NULL,
	"category_id" integer NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"member" text DEFAULT 'משותף' NOT NULL,
	"day" integer NOT NULL,
	"start_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"member" text DEFAULT 'משותף' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"source" text DEFAULT 'occasional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_unique" ON "budgets" USING btree ("household_id","month","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_household_name" ON "categories" USING btree ("household_id","name");