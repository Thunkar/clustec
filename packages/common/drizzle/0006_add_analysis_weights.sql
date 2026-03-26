ALTER TABLE "analysis_config" ADD COLUMN "weights" jsonb;
ALTER TABLE "analysis_config" ADD COLUMN "normalization" text DEFAULT 'minmax';
