-- Add missing indexes on tx_id for cluster_memberships and umap_projections
CREATE INDEX IF NOT EXISTS "cm_tx_idx" ON "cluster_memberships" ("tx_id");
CREATE INDEX IF NOT EXISTS "umap_tx_idx" ON "umap_projections" ("tx_id");

-- Delete old cluster runs, keeping the latest 5 per network.
DELETE FROM "umap_projections" WHERE "run_id" IN (
  SELECT id FROM "cluster_runs" WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY network_id ORDER BY computed_at DESC) as rn
      FROM "cluster_runs"
    ) ranked WHERE rn <= 5
  )
);

DELETE FROM "cluster_memberships" WHERE "run_id" IN (
  SELECT id FROM "cluster_runs" WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY network_id ORDER BY computed_at DESC) as rn
      FROM "cluster_runs"
    ) ranked WHERE rn <= 5
  )
);

DELETE FROM "cluster_runs" WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY network_id ORDER BY computed_at DESC) as rn
    FROM "cluster_runs"
  ) ranked WHERE rn <= 5
);
