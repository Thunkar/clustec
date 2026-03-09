ALTER TABLE "transactions" ALTER COLUMN "fee_payer" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "txs_public_calls_gin_idx" ON "transactions" USING gin ("public_calls");