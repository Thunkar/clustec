-- Add checkpoint fields to blocks
ALTER TABLE "blocks" ADD COLUMN "checkpoint_number" bigint;
ALTER TABLE "blocks" ADD COLUMN "index_within_checkpoint" integer;
CREATE INDEX "blocks_checkpoint_idx" ON "blocks" ("network_id", "checkpoint_number");

-- Create checkpoints table
CREATE TABLE "checkpoints" (
  "id" SERIAL PRIMARY KEY,
  "network_id" TEXT NOT NULL REFERENCES "networks"("id"),
  "checkpoint_number" BIGINT NOT NULL,
  "slot_number" BIGINT,
  "start_block" BIGINT,
  "end_block" BIGINT,
  "block_count" INTEGER NOT NULL DEFAULT 0,
  "total_mana_used" TEXT,
  "total_fees" TEXT,
  "coinbase" TEXT,
  "fee_recipient" TEXT,
  "attestation_count" INTEGER,
  "l1_block_number" BIGINT,
  "l1_timestamp" BIGINT,
  "proven_at" TIMESTAMP,
  "finalized_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE ("network_id", "checkpoint_number")
);

CREATE INDEX "checkpoints_network_idx" ON "checkpoints" ("network_id");
