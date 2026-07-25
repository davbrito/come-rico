CREATE TYPE "public"."household_role" AS ENUM('Member', 'Admin');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('Breakfast', 'Lunch', 'Dinner');--> statement-breakpoint
CREATE TYPE "public"."measurement_unit" AS ENUM('Piece', 'Gram', 'Kilogram', 'Milliliter', 'Liter', 'Cup', 'Tablespoon', 'Teaspoon');--> statement-breakpoint
CREATE TYPE "public"."roulette_status" AS ENUM('Pending', 'Spinning', 'Completed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."stored_file_status" AS ENUM('Pending', 'Active', 'Orphaned');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_tags" (
	"dish_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "dish_tags_dish_id_tag_id_pk" PRIMARY KEY("dish_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"image_key" varchar(2048),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"invite_code" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "households_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"unit" "measurement_unit" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roulette_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"status" "roulette_status" DEFAULT 'Pending' NOT NULL,
	"winner_dish_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"spun_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"amount" numeric(10, 2),
	"unit" "measurement_unit",
	"is_purchased" boolean DEFAULT false NOT NULL,
	"is_auto_generated" boolean DEFAULT false NOT NULL,
	"generated_for_week_start" date,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"key" varchar(512) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"status" "stored_file_status" DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"household_id" uuid,
	"role" "household_role" DEFAULT 'Member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_tags" ADD CONSTRAINT "dish_tags_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_tags" ADD CONSTRAINT "dish_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roulette_sessions" ADD CONSTRAINT "roulette_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roulette_sessions" ADD CONSTRAINT "roulette_sessions_winner_dish_id_dishes_id_fk" FOREIGN KEY ("winner_dish_id") REFERENCES "public"."dishes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_dishes_household" ON "dishes" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ix_ingredients_dish" ON "ingredients" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "ix_meal_plans_household_date" ON "meal_plans" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "ix_roulette_household" ON "roulette_sessions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ix_shopping_household_week" ON "shopping_items" USING btree ("household_id","generated_for_week_start");--> statement-breakpoint
CREATE INDEX "ix_stored_files_household_key" ON "stored_files" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "ix_stored_files_status_created" ON "stored_files" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tags_household_name" ON "tags" USING btree ("household_id","name");