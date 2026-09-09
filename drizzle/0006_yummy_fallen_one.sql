CREATE TABLE "service_heartbeats" (
	"service" text PRIMARY KEY NOT NULL,
	"instance" text NOT NULL,
	"beat_at" timestamp with time zone DEFAULT now() NOT NULL
);
