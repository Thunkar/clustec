-- Migrate 15-dim feature vectors to 16-dim by inserting hasTeardown (0 or 1) at position 12.
-- Old layout: [0..11, totalPublicCalldataSize, expirationDelta, feePayer]
-- New layout: [0..11, hasTeardown, totalPublicCalldataSize, expirationDelta, feePayer]

UPDATE feature_vectors fv
SET vector = (
  SELECT jsonb_build_array(
    v->0, v->1, v->2, v->3, v->4, v->5,
    v->6, v->7, v->8, v->9, v->10, v->11,
    CASE WHEN t.has_teardown THEN 1 ELSE 0 END,
    v->12, v->13, v->14
  )
  FROM transactions t
  WHERE t.id = fv.tx_id
)
WHERE jsonb_array_length(fv.vector) = 15;
