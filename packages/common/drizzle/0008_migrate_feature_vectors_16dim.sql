-- Migrate 15-dim feature vectors to 16-dim by inserting hasTeardown (0 or 1) at position 12.
-- Old layout: [0..11, totalPublicCalldataSize, expirationDelta, feePayer]
-- New layout: [0..11, hasTeardown, totalPublicCalldataSize, expirationDelta, feePayer]

UPDATE feature_vectors fv
SET vector = (
  SELECT jsonb_build_array(
    fv.vector->0, fv.vector->1, fv.vector->2, fv.vector->3, fv.vector->4, fv.vector->5,
    fv.vector->6, fv.vector->7, fv.vector->8, fv.vector->9, fv.vector->10, fv.vector->11,
    CASE WHEN t.has_teardown THEN 1 ELSE 0 END,
    fv.vector->12, fv.vector->13, fv.vector->14
  )
  FROM transactions t
  WHERE t.id = fv.tx_id
)
WHERE jsonb_array_length(fv.vector) = 15;
