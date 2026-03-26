# @clustec/analyzer

Clusters Aztec L2 transactions by shape to detect privacy leaks. Uses UMAP for dimensionality reduction and HDBSCAN for density-based clustering, operating in feature space for O(N) memory scalability.

## Architecture

```
                  PostgreSQL
                      │
                      ▼
              ┌───────────────┐
              │ load_features │  Extract 14 numeric dims + fee payer
              └───────┬───────┘  from feature_vectors table
                      │
                      ▼
         ┌─────────────────────────┐
         │ prepare_feature_matrix  │  Range-normalize numerics to [0,1],
         │                        │  frequency-encode + weight categorical
         └────────────┬────────────┘
                      │
               (N×15 float32 matrix)
                      │
              ┌───────┴───────┐
              │               │
              ▼               ▼
       ┌────────────┐  ┌───────────┐
       │  HDBSCAN   │  │   UMAP    │
       │  cluster   │  │  project  │  Approximate NN graph
       │  on 15D    │  │  to 3D    │  for visualization only
       └─────┬──────┘  └─────┬─────┘
             │               │
             └───────┬───────┘
                     │
                     ▼
              ┌─────────────┐  UMAP coordinates position each point,
              │  PostgreSQL  │  HDBSCAN labels color them by cluster.
              └─────────────┘
```

HDBSCAN clusters on the full 15-dimensional feature matrix for accurate density-based grouping. UMAP projects the same features to 3D for visualization only — it does not affect cluster assignments. Both operate in feature space with euclidean distance and approximate nearest neighbors, scaling to 50K+ transactions on modest hardware (~4GB RAM).

## Pipeline

| Step | Module | What it does |
|------|--------|-------------|
| 1 | `features.load_features` | Loads feature vectors from DB. Splits into 14 numeric dimensions and 1 categorical (fee payer). |
| 2 | `features.prepare_feature_matrix` | Range-normalizes numerics to [0,1], frequency-encodes the fee payer categorical. Returns (N, 15) float32 array. |
| 3 | `clustering.run_hdbscan` | Clusters on the 15D feature matrix with euclidean metric. Returns labels, membership scores, outlier scores. |
| 4 | `umap_proj.compute_umap` | Projects to 3D via UMAP with euclidean metric and approximate NN search. For visualization only. |
| 5 | `pipeline.run_pipeline` | Orchestrates steps 1-4, stores results to `cluster_runs`, `cluster_memberships`, `umap_projections`. |

## Feature Encoding

The feature matrix mixes numeric and categorical data:

- **Numeric features** (dims 0-13): range-normalized to [0, 1] so all dimensions contribute equally
- **Categorical feature** (dim 14, fee payer): frequency-encoded — each unique address maps to its occurrence fraction. Txs with the same fee payer get identical values (distance = 0), different payers get different values, and rare payers are further from common ones. Scaled by `√14` so it carries equal total weight to the combined numeric dimensions.

This produces a unified numeric matrix suitable for euclidean distance in both HDBSCAN and UMAP.

A full Gower distance function (`features.gower_distance_matrix`) is also available for small-scale comparisons (e.g. the cluster recommend API, which compares a single vector against cluster centroids).

## Feature Vector Layout (15 dimensions)

Computed by the indexer at block time (when txs are proposed) and stored in `feature_vectors.vector` as JSON. This ensures post-execution fields like `numPublicLogs` have real values.

| Dim | Field | Type |
|-----|-------|------|
| 0 | numNoteHashes | numeric |
| 1 | numNullifiers | numeric |
| 2 | numL2ToL1Msgs | numeric |
| 3 | numPrivateLogs | numeric |
| 4 | numContractClassLogs | numeric |
| 5 | numPublicLogs | numeric |
| 6 | gasLimitDa | numeric |
| 7 | gasLimitL2 | numeric |
| 8 | maxFeePerDaGas | numeric |
| 9 | maxFeePerL2Gas | numeric |
| 10 | numSetupCalls | numeric |
| 11 | numAppCalls | numeric |
| 12 | totalPublicCalldataSize | numeric |
| 13 | expirationDelta | numeric |
| 14 | feePayer | categorical |

**Fee payer** is the AztecAddress that pays the tx fee. Txs using the same fee payment contract (FPC) will share this value — a strong clustering signal indicating they likely come from the same application.

## Usage

```bash
# Run analysis for a network
uv run analyzer devnet

# With custom parameters
uv run analyzer devnet --min-cluster-size 10 --n-neighbors 20 --dimensions 2
```

## Testing

```bash
uv run pytest tests/ -v
```

14 tests covering:
- Gower distance properties (symmetry, bounds, diagonal, categorical vs numeric contributions)
- UMAP projection (output shape, determinism)
- HDBSCAN clustering (cluster detection, score bounds)
