import {
  pgTable,
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
} from "drizzle-orm/pg-core";

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
  lastBlockNumber: bigint("last_block_number", { mode: "number" })
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
    totalFees: text("total_fees"), // stored as string to avoid precision loss
    totalManaUsed: text("total_mana_used"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("blocks_network_block").on(t.networkId, t.blockNumber),
    index("blocks_network_idx").on(t.networkId),
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
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
    txIndex: integer("tx_index").notNull(),
    revertCode: integer("revert_code").notNull().default(0),
    transactionFee: text("transaction_fee"), // string for bigint precision

    // ── Shape counts (the privacy leakage surface) ──
    numNoteHashes: integer("num_note_hashes").notNull().default(0),
    numNullifiers: integer("num_nullifiers").notNull().default(0),
    numL2ToL1Msgs: integer("num_l2_to_l1_msgs").notNull().default(0),
    numPublicDataWrites: integer("num_public_data_writes")
      .notNull()
      .default(0),
    numPrivateLogs: integer("num_private_logs").notNull().default(0),
    numPublicLogs: integer("num_public_logs").notNull().default(0),
    numContractClassLogs: integer("num_contract_class_logs")
      .notNull()
      .default(0),
    privateLogTotalSize: integer("private_log_total_size")
      .notNull()
      .default(0),
    publicLogTotalSize: integer("public_log_total_size").notNull().default(0),

    // ── From full Tx public inputs (if captured) ──
    feePayer: text("fee_payer"),
    expirationTimestamp: bigint("expiration_timestamp", { mode: "number" }),
    gasLimitDa: bigint("gas_limit_da", { mode: "number" }),
    gasLimitL2: bigint("gas_limit_l2", { mode: "number" }),
    maxFeePerDaGas: bigint("max_fee_per_da_gas", { mode: "number" }),
    maxFeePerL2Gas: bigint("max_fee_per_l2_gas", { mode: "number" }),

    // ── Gas usage ──
    gasUsedDa: bigint("gas_used_da", { mode: "number" }),
    gasUsedL2: bigint("gas_used_l2", { mode: "number" }),

    // ── Public call structure ──
    numSetupCalls: integer("num_setup_calls").default(0),
    numAppCalls: integer("num_app_calls").default(0),
    hasTeardown: boolean("has_teardown").default(false),
    publicCalls: jsonb("public_calls"), // PublicCallInfo[]

    // ── L2→L1 messages with recipients ──
    l2ToL1MsgDetails: jsonb("l2_to_l1_msg_details"), // L2ToL1MsgInfo[]

    // ── Raw data for future analysis ──
    rawTxEffect: jsonb("raw_tx_effect"),
    rawPublicInputs: jsonb("raw_public_inputs"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("txs_network_hash").on(t.networkId, t.txHash),
    index("txs_network_block_idx").on(t.networkId, t.blockNumber),
    index("txs_hash_idx").on(t.txHash),
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
    value: text("value").notNull(), // hex string
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
    value: text("value").notNull(), // hex string
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
    leafSlot: text("leaf_slot").notNull(), // hex string
    value: text("value").notNull(), // hex string
    position: integer("position").notNull(),
  },
  (t) => [index("pdw_leaf_slot_idx").on(t.leafSlot)]
);

// ── Contract interactions (from public/contract class logs) ──

export const contractInteractions = pgTable(
  "contract_interactions",
  {
    id: serial("id").primaryKey(),
    txId: integer("tx_id")
      .references(() => transactions.id)
      .notNull(),
    contractAddress: text("contract_address").notNull(),
    source: text("source").notNull(), // "public_log" | "contract_class_log" | "public_data_write"
  },
  (t) => [
    index("ci_tx_idx").on(t.txId),
    index("ci_contract_idx").on(t.contractAddress),
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
    contractType: text("contract_type"), // e.g. "Token", "AMM", "FPC"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("labels_network_address").on(t.networkId, t.address)]
);

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
  algorithm: text("algorithm").notNull(), // e.g. "hdbscan"
  params: jsonb("params"), // algorithm-specific parameters
  numClusters: integer("num_clusters"),
  numOutliers: integer("num_outliers"),
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
    clusterId: integer("cluster_id").notNull(), // -1 = outlier in HDBSCAN
    membershipScore: real("membership_score"),
    outlierScore: real("outlier_score"),
  },
  (t) => [
    index("cm_run_idx").on(t.runId),
    index("cm_cluster_idx").on(t.runId, t.clusterId),
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
  (t) => [index("umap_run_idx").on(t.runId)]
);
