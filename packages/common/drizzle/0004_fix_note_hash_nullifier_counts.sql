-- Recount num_note_hashes and num_nullifiers from the side-effect tables,
-- which were populated from TxEffect (authoritative post-execution values).
-- The transactions table previously stored counts from the pre-execution
-- mempool Tx, which could differ when public VM execution added hashes/nullifiers.
-- Only corrects mined txs (block_number IS NOT NULL) that have side-effect rows.

UPDATE transactions t
SET
  num_note_hashes = (SELECT COUNT(*) FROM note_hashes nh WHERE nh.tx_id = t.id),
  num_nullifiers  = (SELECT COUNT(*) FROM nullifiers  n  WHERE n.tx_id  = t.id)
WHERE t.block_number IS NOT NULL;
