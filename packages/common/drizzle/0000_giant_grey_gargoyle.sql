CREATE TYPE "public"."tx_status" AS ENUM('pending', 'mined', 'finalized');--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text,
	"timestamp" bigint,
	"slot_number" bigint,
	"num_txs" integer DEFAULT 0 NOT NULL,
	"total_fees" text,
	"total_mana_used" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_network_block" UNIQUE("network_id","block_number")
);
--> statement-breakpoint
CREATE TABLE "cluster_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"tx_id" integer NOT NULL,
	"cluster_id" integer NOT NULL,
	"membership_score" real,
	"outlier_score" real
);
--> statement-breakpoint
CREATE TABLE "cluster_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"algorithm" text NOT NULL,
	"params" jsonb,
	"num_clusters" integer,
	"num_outliers" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"function_selector" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"address" text NOT NULL,
	"label" text NOT NULL,
	"contract_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "labels_network_address" UNIQUE("network_id","address")
);
--> statement-breakpoint
CREATE TABLE "feature_vectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_id" integer NOT NULL,
	"vector" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_vectors_tx_id_unique" UNIQUE("tx_id")
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"node_url" text NOT NULL,
	"chain_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_hashes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_id" integer NOT NULL,
	"value" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nullifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_id" integer NOT NULL,
	"value" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_data_writes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_id" integer NOT NULL,
	"leaf_slot" text NOT NULL,
	"value" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"last_block_number" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"block_number" bigint,
	"tx_index" integer,
	"revert_code" integer DEFAULT 0,
	"actual_fee" text,
	"num_note_hashes" integer DEFAULT 0 NOT NULL,
	"num_nullifiers" integer DEFAULT 0 NOT NULL,
	"num_l2_to_l1_msgs" integer DEFAULT 0 NOT NULL,
	"num_private_logs" integer DEFAULT 0 NOT NULL,
	"num_contract_class_logs" integer DEFAULT 0 NOT NULL,
	"gas_limit_da" bigint,
	"gas_limit_l2" bigint,
	"max_fee_per_da_gas" bigint,
	"max_fee_per_l2_gas" bigint,
	"num_setup_calls" integer DEFAULT 0 NOT NULL,
	"num_app_calls" integer DEFAULT 0 NOT NULL,
	"has_teardown" boolean DEFAULT false NOT NULL,
	"total_public_calldata_size" integer DEFAULT 0 NOT NULL,
	"fee_payer" text,
	"expiration_timestamp" bigint,
	"public_calls" jsonb,
	"l2_to_l1_msg_details" jsonb,
	"num_public_data_writes" integer DEFAULT 0,
	"num_public_logs" integer DEFAULT 0,
	"private_log_total_size" integer DEFAULT 0,
	"public_log_total_size" integer DEFAULT 0,
	"raw_tx" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"mined_at" timestamp,
	CONSTRAINT "txs_network_hash" UNIQUE("network_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "umap_projections" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"tx_id" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"z" real
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_memberships" ADD CONSTRAINT "cluster_memberships_run_id_cluster_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cluster_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_memberships" ADD CONSTRAINT "cluster_memberships_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_runs" ADD CONSTRAINT "cluster_runs_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_interactions" ADD CONSTRAINT "contract_interactions_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_labels" ADD CONSTRAINT "contract_labels_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_vectors" ADD CONSTRAINT "feature_vectors_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_hashes" ADD CONSTRAINT "note_hashes_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nullifiers" ADD CONSTRAINT "nullifiers_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_data_writes" ADD CONSTRAINT "public_data_writes_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umap_projections" ADD CONSTRAINT "umap_projections_run_id_cluster_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cluster_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umap_projections" ADD CONSTRAINT "umap_projections_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_network_idx" ON "blocks" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "cm_run_idx" ON "cluster_memberships" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "cm_cluster_idx" ON "cluster_memberships" USING btree ("run_id","cluster_id");--> statement-breakpoint
CREATE INDEX "ci_tx_idx" ON "contract_interactions" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "ci_contract_idx" ON "contract_interactions" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX "ci_selector_idx" ON "contract_interactions" USING btree ("function_selector");--> statement-breakpoint
CREATE INDEX "fv_tx_idx" ON "feature_vectors" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "note_hashes_value_idx" ON "note_hashes" USING btree ("value");--> statement-breakpoint
CREATE INDEX "nullifiers_value_idx" ON "nullifiers" USING btree ("value");--> statement-breakpoint
CREATE INDEX "pdw_leaf_slot_idx" ON "public_data_writes" USING btree ("leaf_slot");--> statement-breakpoint
CREATE INDEX "txs_status_idx" ON "transactions" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "txs_hash_idx" ON "transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "txs_fee_payer_idx" ON "transactions" USING btree ("fee_payer");--> statement-breakpoint
CREATE INDEX "txs_block_idx" ON "transactions" USING btree ("network_id","block_number");--> statement-breakpoint
CREATE INDEX "umap_run_idx" ON "umap_projections" USING btree ("run_id");