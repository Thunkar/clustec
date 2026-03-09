# @clustec/indexer

Indexes Aztec L2 transactions from both the mempool and the block stream, storing structured data for clustering analysis.

## Architecture

```
                        Aztec Node RPC
                       ┌──────┴──────┐
                       │             │
               getPendingTxs   L2BlockStream
                       │             │
                       ▼             ▼
              ┌─────────────┐ ┌──────────────┐
              │  Mempool     │ │  Block        │
              │  Watcher     │ │  Processor    │
              │ (pending)    │ │ (proposed+)   │
              └──────┬──────┘ └──────┬────────┘
                     │               │
                     ▼               ▼
              ┌──────────────────────────────┐
              │         PostgreSQL            │
              │  transactions, blocks,        │
              │  feature_vectors, nullifiers, │
              │  note_hashes, ...             │
              └──────────────────────────────┘
```

## Startup Sequence

1. **Startup Reconciler** — queries all non-finalized, non-dropped txs and reconciles their status against the node via `getTxReceipt`. Catches any state changes that happened while the indexer was offline.
2. **Mempool Watcher** — polls `getPendingTxs` every 500ms. Extracts full `Tx` data (shape counts, gas, public calls, fee payer) and computes feature vectors for clustering.
3. **Block Processor** — subscribes to `L2BlockStream` events. This is the **source of truth** for tx status.

## Data Flow

### Mempool Watcher → `extractFromTx(Tx)`

Captures pre-execution data from the full `Tx` object in the mempool:

| Extracted Field | Source |
|---|---|
| Shape counts (noteHashes, nullifiers, logs, ...) | `tx.data` private kernel outputs |
| Gas settings (limits, max fees) | `tx.data.constants.txContext.gasSettings` |
| Public call details (contract, selector, phase) | `tx.get{NonRevertible,Revertible,Teardown}PublicCallRequests` |
| Fee payer | `tx.data.feePayer` |
| Expiration / anchor block timestamps | `tx.data.expirationTimestamp`, `tx.data.constants.anchorBlockHeader` |

After upsert, if the tx is still `pending` (not already promoted by the block processor), it also inserts:
- **contract_interactions** — one row per public call
- **feature_vectors** — 13-dim numeric vector for clustering

### Block Processor → `extractFromTxEffect(TxEffect)`

Captures post-execution data from mined blocks:

| Extracted Field | Source |
|---|---|
| Execution result (success, reverted, ...) | `effect.revertCode` |
| Actual fee | `effect.transactionFee` |
| Public data writes, note hashes, nullifiers | `effect.*` (side-effect arrays) |
| Log sizes | `effect.privateLogs`, `effect.publicLogs` |

### Startup Reconciler → `extractFromReceipt(TxReceipt)`

Lightweight status check — updates status and block number from the receipt, fetches `TxEffect` if a pending tx was mined while offline.

## Transaction Status Lifecycle

The block processor maps `L2BlockStream` events to status transitions:

```
                         ┌─────────┐
                         │ DROPPED │
                         └────▲────┘
                              │ (reconciler only)
┌─────────┐  blocks   ┌──────┴───┐  checkpoint  ┌──────────────┐
│ PENDING  │──added───▶│ PROPOSED │─────────────▶│CHECKPOINTED  │
└─────────┘           └──────────┘              └──────┬───────┘
                                                       │ proven
                                                ┌──────▼───────┐
                                                │    PROVEN     │
                                                └──────┬───────┘
                                                       │ finalized
                                                ┌──────▼───────┐
                                                │  FINALIZED    │
                                                └──────────────┘
```

| Stream Event | Status Transition | Scope |
|---|---|---|
| `blocks-added` | → `proposed` | Upserts tx + side-effects, inserts block row |
| `chain-checkpointed` | `proposed` → `checkpointed` | Batch update by block number |
| `chain-proven` | `proposed\|checkpointed` → `proven` | Batch update by block number |
| `chain-finalized` | `proposed\|checkpointed\|proven` → `finalized` | Batch update by block number |
| `chain-pruned` | Reverts to `pending` (if has mempool data) or deletes | Cleans up side-effects, resets block fields |

## Feature Vector (14 dimensions)

Computed from mempool data only. Stored as JSON in `feature_vectors.vector`. The Python analyzer splits numeric and categorical features and uses Gower distance for clustering.

| Dim | Field | Type | Notes |
|-----|-------|------|-------|
| 0 | numNoteHashes | numeric | |
| 1 | numNullifiers | numeric | |
| 2 | numL2ToL1Msgs | numeric | |
| 3 | numPrivateLogs | numeric | |
| 4 | numContractClassLogs | numeric | |
| 5 | gasLimitDa | numeric | 0 if null |
| 6 | gasLimitL2 | numeric | 0 if null |
| 7 | maxFeePerDaGas | numeric | 0 if null |
| 8 | maxFeePerL2Gas | numeric | 0 if null |
| 9 | numSetupCalls | numeric | |
| 10 | numAppCalls | numeric | |
| 11 | totalPublicCalldataSize | numeric | |
| 12 | expirationDelta | numeric | `expirationTimestamp - anchorBlockTimestamp` (default ~24) |
| 13 | feePayer | categorical | AztecAddress of fee payer |
