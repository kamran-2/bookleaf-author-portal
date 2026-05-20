CREATE TYPE "public"."user_role" AS ENUM('author', 'admin');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('Open', 'In Progress', 'Resolved', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('Critical', 'High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'author' NOT NULL,
	"phone" varchar(30),
	"city" varchar(100),
	"author_id" varchar(20),
	"joined_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_author_id_unique" UNIQUE("author_id")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar(20),
	"author_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"isbn" varchar(50),
	"genre" varchar(150),
	"publication_date" date,
	"status" varchar(100) DEFAULT 'In Production' NOT NULL,
	"mrp" numeric(10, 2),
	"author_royalty_per_copy" numeric(10, 2),
	"total_copies_sold" integer DEFAULT 0 NOT NULL,
	"total_royalty_earned" numeric(12, 2) DEFAULT '0' NOT NULL,
	"royalty_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"royalty_pending" numeric(12, 2) DEFAULT '0' NOT NULL,
	"last_royalty_payout_date" date,
	"print_partner" varchar(100),
	"available_on" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_book_id_unique" UNIQUE("book_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"book_id" uuid,
	"subject" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'Open' NOT NULL,
	"category" "ticket_category",
	"ai_category" "ticket_category",
	"priority" "ticket_priority" DEFAULT 'Medium' NOT NULL,
	"ai_priority" "ticket_priority",
	"assigned_to" uuid,
	"ai_draft_response" text,
	"ai_processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"responder_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_books_author_id" ON "books" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_author_id" ON "tickets" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_priority" ON "tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_tickets_category" ON "tickets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_tickets_assigned_to" ON "tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_tickets_created_at" ON "tickets" USING btree ("created_at");