# @clustec/analyzer

Clusters Aztec L2 transactions by shape to detect privacy leaks. Uses Gower distance (mixed numeric + categorical), HDBSCAN for density-based clustering, and UMAP for visualization.

## Architecture

```
                  PostgreSQL
                      │
                      ▼
              ┌───────────────┐
              │ load_features │  Extract 13 numeric dims + fee payer
              └───────┬───────┘  from feature_vectors table
                      │
                      ▼
           ┌─────────────────────┐
           │ gower_distance_matrix│  Mixed-type distance:
           │                     │  numeric → range-normalized Manhattan
           │                     │  categorical → simple matching
           └──────────┬──────────┘
                      │
              (N×N distance matrix)
                      │
              ┌───────┴───────┐
              │               │
              ▼               ▼
       ┌────────────┐  ┌───────────┐
       │  HDBSCAN   │  │   UMAP    │
       │  cluster   │  │  project  │
       │  labels    │  │  to 2D/3D │
       └─────┬──────┘  └─────┬─────┘
             │               │
             └───────┬───────┘
                     │
                     ▼  The frontend combines both:
              ┌─────────────┐  UMAP coordinates position each point,
              │  PostgreSQL  │  HDBSCAN labels color them by cluster.
              └─────────────┘
```

Both HDBSCAN and UMAP operate on the **same Gower distance matrix**. UMAP preserves the distance structure in a low-dimensional embedding for visualization. HDBSCAN finds density-based clusters in the full distance space. Because they share the same distance input, the spatial groupings you see in the UMAP plot correspond to the clusters HDBSCAN identifies.

## Pipeline

| Step | Module | What it does |
|------|--------|-------------|
| 1 | `features.load_features` | Loads feature vectors from DB. Splits into 13 numeric dimensions and 1 categorical (fee payer). |
| 2 | `features.gower_distance_matrix` | Computes N×N pairwise distance matrix using Gower distance. |
| 3 | `umap_proj.compute_umap` | Projects distance matrix to 2D/3D via UMAP (`metric="precomputed"`). For visualization only. |
| 4 | `clustering.run_hdbscan` | Clusters on the Gower distance matrix (`metric="precomputed"`). Returns labels, membership scores, outlier scores. |
| 5 | `pipeline.run_pipeline` | Orchestrates steps 1-4, stores results to `cluster_runs`, `cluster_memberships`, `umap_projections`. |

## Gower Distance

Handles mixed feature types correctly, unlike Euclidean distance which only works with numerics.

For two samples `i` and `j`, the Gower distance is the average of per-feature distances:

| Feature type | Distance formula |
|---|---|
| Numeric | `\|x_i - x_j\| / range` (range-normalized Manhattan, values in [0,1]) |
| Categorical | `0` if same, `1` if different |

```
gower(i, j) = (sum of numeric distances + sum of categorical distances) / total features
```

Result is always in [0, 1]. Both HDBSCAN and UMAP accept precomputed distance matrices.

## Feature Vector Layout (14 dimensions)

Computed by the indexer from mempool `Tx` data and stored in `feature_vectors.vector` as JSON.

| Dim | Field | Type |
|-----|-------|------|
| 0 | numNoteHashes | numeric |
| 1 | numNullifiers | numeric |
| 2 | numL2ToL1Msgs | numeric |
| 3 | numPrivateLogs | numeric |
| 4 | numContractClassLogs | numeric |
| 5 | gasLimitDa | numeric |
| 6 | gasLimitL2 | numeric |
| 7 | maxFeePerDaGas | numeric |
| 8 | maxFeePerL2Gas | numeric |
| 9 | numSetupCalls | numeric |
| 10 | numAppCalls | numeric |
| 11 | totalPublicCalldataSize | numeric |
| 12 | expirationDelta | numeric |
| 13 | feePayer | categorical |

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
- UMAP with precomputed distance (output shape, determinism)
- HDBSCAN with precomputed distance (cluster detection, score bounds)
