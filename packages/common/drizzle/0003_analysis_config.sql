CREATE TABLE "analysis_config" (
	"network_id" text PRIMARY KEY NOT NULL,
	"min_cluster_size" integer DEFAULT 5 NOT NULL,
	"n_neighbors" integer DEFAULT 15 NOT NULL,
	"min_dist" real DEFAULT 0.1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_config" ADD CONSTRAINT "analysis_config_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;
