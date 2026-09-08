CREATE TABLE "registration_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
