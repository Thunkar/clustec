-- Fix checkpoint data corrupted by reorgs:
-- 1. Update checkpoint block_count to match actual blocks present
-- 2. Fix start_block/end_block to match actual block range
-- 3. Remove checkpoints with zero actual blocks

-- Update block_count and ranges to match reality
UPDATE checkpoints cp
SET
  block_count = sub.actual_count,
  start_block = sub.actual_start,
  end_block = sub.actual_end
FROM (
  SELECT cp2.id,
    count(b.block_number)::int AS actual_count,
    min(b.block_number)::bigint AS actual_start,
    max(b.block_number)::bigint AS actual_end
  FROM checkpoints cp2
  LEFT JOIN blocks b ON b.network_id = cp2.network_id
    AND b.checkpoint_number = cp2.checkpoint_number
  GROUP BY cp2.id
) sub
WHERE cp.id = sub.id AND (cp.block_count != sub.actual_count OR cp.start_block != sub.actual_start OR cp.end_block != sub.actual_end);

-- Delete checkpoints that have no matching blocks at all
DELETE FROM checkpoints cp
WHERE NOT EXISTS (
  SELECT 1 FROM blocks b
  WHERE b.network_id = cp.network_id AND b.checkpoint_number = cp.checkpoint_number
);
