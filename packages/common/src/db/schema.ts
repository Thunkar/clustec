import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  bigint,
  boolean,
  real,
  timestamp,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────

// Matches TxStatus from @aztec/stdlib/tx
export const txStatusEnum = pgEnum("tx_status", [
  "dropped",
  "pending",
  "proposed",
  "checkpointed",
  "proven",
  "finalized",
]);

// Matches TxExecutionResult from @aztec/stdlib/tx
export const txExecutionResultEnum = pgEnum("tx_execution_result", [
  "success",
  "app_logic_reverted",
  "teardown_reverted",
  "both_reverted",
]);

// ── Networks ──────────────────────────────────────────────

export const networks = pgTable("networks", {
  id: text("id").primaryKey(), // e.g. "devnet"
  name: text("name").notNull(),
  nodeUrl: text("node_url").notNull(),
  chainId: integer("chain_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Sync Cursors ──────────────────────────────────────────

export const syncCursors = pgTable("sync_cursors", {
  id: serial("id").primaryKey(),
  networkId: text("network_id")
    .references(() => networks.id)
    .notNull(),
  proposedBlock: bigint("proposed_block", { mode: "number" })
    .notNull()
    .default(0),
  checkpointedBlock: bigint("checkpointed_block", { mode: "number" })
    .notNull()
    .default(0),
  provenBlock: bigint("proven_block", { mode: "number" })
    .notNull()
    .default(0),
  finalizedBlock: bigint("finalized_block", { mode: "number" })
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Blocks ────────────────────────────────────────────────

export const blocks = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    networkId: text("network_id")
      .references(() => networks.id)
      .notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    blockHash: text("block_hash"),
    timestamp: bigint("timestamp", { mode: "number" }),
    slotNumber: bigint("slot_number", { mode: "number" }),
    numTxs: integer("num_txs").notNull().default(0),
    totalFees: text("total_fees"),
    totalManaUsed: text("total_mana_used"),
    feePerDaGas: text("fee_per_da_gas"),
    feePerL2Gas: text("fee_per_l2_gas"),
    coinbase: text("coinbase"),
    feeRecipient: text("fee_recipient"),
    checkpointNumber: bigint("checkpoint_number", { mode: "number" }),
    indexWithinCheckpoint: integer("index_within_checkpoint"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("blocks_network_block").on(t.networkId, t.blockNumber),
    index("blocks_network_idx").on(t.networkId),
    index("blocks_checkpoint_idx").on(t.networkId, t.checkpointNumber),
  ]
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    id: serial("id").primaryKey(),
    networkId: text("network_id")
      .references(() => networks.id)
      .notNull(),
    checkpointNumber: bigint("checkpoint_number", { mode: "number" }).notNull(),
    slotNumber: bigint("slot_number", { mode: "number" }),
    startBlock: bigint("start_block", { mode: "number" }),
    endBlock: bigint("end_block", { mode: "number" }),
    blockCount: integer("block_count").notNull().default(0),
    totalManaUsed: text("total_mana_used"),
    totalFees: text("total_fees"),
    coinbase: text("coinbase"),
    feeRecipient: text("fee_recipient"),
    attestationCount: integer("attestation_count"),
    l1BlockNumber: bigint("l1_block_number", { mode: "number" }),
    l1Timestamp: bigint("l1_timestamp", { mode: "number" }),
    provenAt: timestamp("proven_at"),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("checkpoints_network_num").on(t.networkId, t.checkpointNumber),
    index("checkpoints_network_idx").on(t.networkId),
  ]
);

// ── Transactions ──────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    networkId: text("network_id")
      .references(() => networks.id)
      .notNull(),
    txHash: text("tx_hash").notNull(),
    status: txStatusEnum("status").notNull().default("pending"),

    // ── Execution result (filled on propose) ──
    executionResult: txExecutionResultEnum("execution_result"),
    error: text("error"), // from TxReceipt, drop/revert descriptions

    // ── Block context (filled on propose) ──
    blockNumber: bigint("block_number", { mode: "number" }),
    txIndex: integer("tx_index"),
    actualFee: text("actual_fee"), // string for bigint precision

    // ── Shape counts (from private kernel public inputs, available at pending) ──
    numNoteHashes: integer("num_note_hashes").notNull().default(0),
    numNullifiers: integer("num_nullifiers").notNull().default(0),
    numL2ToL1Msgs: integer("num_l2_to_l1_msgs").notNull().default(0),
    numPrivateLogs: integer("num_private_logs").notNull().default(0),
    numContractClassLogs: integer("num_contract_class_logs")
      .notNull()
      .default(0),

    // ── Gas settings (from full Tx object, available at pending) ──
    gasLimitDa: bigint("gas_limit_da", { mode: "number" }),
    gasLimitL2: bigint("gas_limit_l2", { mode: "number" }),
    maxFeePerDaGas: bigint("max_fee_per_da_gas", { mode: "number" }),
    maxFeePerL2Gas: bigint("max_fee_per_l2_gas", { mode: "number" }),

    // ── Public call structure (from full Tx object, available at pending) ──
    numSetupCalls: integer("num_setup_calls").notNull().default(0),
    numAppCalls: integer("num_app_calls").notNull().default(0),
    hasTeardown: boolean("has_teardown").notNull().default(false),
    totalPublicCalldataSize: integer("total_public_calldata_size")
      .notNull()
      .default(0),

    // ── Queryable metadata ──
    feePayer: text("fee_payer").notNull(),
    expirationTimestamp: bigint("expiration_timestamp", { mode: "number" }),
    anchorBlockTimestamp: bigint("anchor_block_timestamp", { mode: "number" }),

    // ── Structured data (JSONB) ──
    // [{contractAddress, functionSelector, msgSender, isStaticCall, phase, calldataSize, calldata}]
    publicCalls: jsonb("public_calls"),
    // [{recipient, senderContract}]
    l2ToL1MsgDetails: jsonb("l2_to_l1_msg_details"),

    // ── Execution results (filled on propose, from TxEffect) ──
    numPublicDataWrites: integer("num_public_data_writes").default(0),
    numPublicLogs: integer("num_public_logs").default(0),
    privateLogTotalSize: integer("private_log_total_size").default(0),
    publicLogTotalSize: integer("public_log_total_size").default(0),

    // ── Raw data preservation ──
    rawTx: jsonb("raw_tx"), // full Tx object from mempool (if captured)
    rawTxEffect: jsonb("raw_tx_effect"), // full TxEffect from block

    // ── Data source tracking ──
    hasPendingData: boolean("has_pending_data").notNull().default(false),

    // ── Timestamps ──
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    proposedAt: timestamp("proposed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("txs_network_hash").on(t.networkId, t.txHash),
    index("txs_status_idx").on(t.networkId, t.status),
    index("txs_hash_idx").on(t.txHash),
    index("txs_fee_payer_idx").on(t.feePayer),
    index("txs_block_idx").on(t.networkId, t.blockNumber),
    // GIN index for JSONB search on public call addresses
    index("txs_public_calls_gin_idx").using(
      "gin",
      t.publicCalls,
    ),
  ]
);

// ── Side effects (for cross-tx analysis) ──────────────────

export const noteHashes = pgTable(
  "note_hashes",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("note_hashes_value_idx").on(t.value)]
);

export const nullifiers = pgTable(
  "nullifiers",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("nullifiers_value_idx").on(t.value)]
);

export const publicDataWrites = pgTable(
  "public_data_writes",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    leafSlot: text("leaf_slot").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("pdw_leaf_slot_idx").on(t.leafSlot)]
);

// ── Contract interactions (from public calls) ─────────────

export const contractInteractions = pgTable(
  "contract_interactions",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    contractAddress: text("contract_address").notNull(),
    functionSelector: text("function_selector"),
    source: text("source").notNull(), // "setup" | "app" | "teardown"
  },
  (t) => [
    index("ci_tx_idx").on(t.txId),
    index("ci_contract_idx").on(t.contractAddress),
    index("ci_selector_idx").on(t.functionSelector),
  ]
);

// ── Public address appearances (reverse index for murder board) ──

export const addressAppearanceRoleEnum = pgEnum("address_appearance_role", [
  "msgSender",
  "calldata",
  "l2ToL1Recipient",
  "l2ToL1Sender",
]);

export const publicAddressAppearances = pgTable(
  "public_address_appearances",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    address: text("address").notNull(),
    role: addressAppearanceRoleEnum("role").notNull(),
  },
  (t) => [
    index("paa_address_idx").on(t.address),
    index("paa_tx_idx").on(t.txId),
    uniqueIndex("paa_unique").on(t.txId, t.address, t.role),
  ]
);

// ── Public metadata enrichment ────────────────────────────

export const contractLabels = pgTable(
  "contract_labels",
  {
    id: serial("id").primaryKey(),
    networkId: text("network_id")
      .references(() => networks.id)
      .notNull(),
    address: text("address").notNull(),
    label: text("label").notNull(),
    contractType: text("contract_type"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("labels_network_address").on(t.networkId, t.address)]
);

// ── Analysis configuration (persisted, one row per network) ──────────

export const analysisConfig = pgTable("analysis_config", {
  networkId: text("network_id")
    .primaryKey()
    .references(() => networks.id),
  minClusterSize: integer("min_cluster_size").notNull().default(5),
  nNeighbors: integer("n_neighbors").notNull().default(15),
  minDist: real("min_dist").notNull().default(0.1),
  weights: jsonb("weights"),
  normalization: text("normalization").default("minmax"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Analysis outputs ──────────────────────────────────────

export const featureVectors = pgTable(
  "feature_vectors",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull()
      .unique(),
    vector: jsonb("vector").notNull(), // number[]
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [index("fv_tx_idx").on(t.txId)]
);

export const clusterRuns = pgTable("cluster_runs", {
  id: serial("id").primaryKey(),
  networkId: text("network_id")
    .references(() => networks.id)
    .notNull(),
  algorithm: text("algorithm").notNull(),
  params: jsonb("params"),
  numClusters: integer("num_clusters"),
  numOutliers: integer("num_outliers"),
  centroids: jsonb("centroids"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
});

export const clusterMemberships = pgTable(
  "cluster_memberships",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => clusterRuns.id)
      .notNull(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    clusterId: integer("cluster_id").notNull(),
    membershipScore: real("membership_score"),
    outlierScore: real("outlier_score"),
  },
  (t) => [
    index("cm_run_idx").on(t.runId),
    index("cm_cluster_idx").on(t.runId, t.clusterId),
    index("cm_tx_idx").on(t.txId),
  ]
);

export const umapProjections = pgTable(
  "umap_projections",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => clusterRuns.id)
      .notNull(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    z: real("z"),
  },
  (t) => [
    index("umap_run_idx").on(t.runId),
    index("umap_tx_idx").on(t.txId),
  ]
);
