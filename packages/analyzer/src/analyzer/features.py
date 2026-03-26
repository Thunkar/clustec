"""Load feature vectors and prepare data for analysis.

The feature vector is a mixed-type array: 14 numeric dimensions followed
by 1 categorical dimension (fee payer address).

For scalable analysis (avoiding O(N²) distance matrices), categoricals
are label-encoded and all features are range-normalized so UMAP and
HDBSCAN can operate in feature space with euclidean distance.
"""

import json

import numpy as np
import psycopg

# Layout: 14 numeric + 1 categorical (fee payer)
NUMERIC_DIM = 14
CATEGORICAL_START = 14


def load_features(
    conn: psycopg.Connection, network_id: str
) -> tuple[np.ndarray, list[str], list[int], list[str]]:
    """Load feature vectors for a network.

    Returns:
        numeric: (N, 14) array of numeric features
        categoricals: list of N fee payer strings
        tx_ids: list of transaction DB IDs
        tx_hashes: list of transaction hashes
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT fv.tx_id, t.tx_hash, fv.vector
            FROM feature_vectors fv
            JOIN transactions t ON t.id = fv.tx_id
            WHERE t.network_id = %s
            ORDER BY fv.tx_id
            """,
            (network_id,),
        )
        rows = cur.fetchall()

    if not rows:
        return np.array([]), [], [], []

    tx_ids = [r[0] for r in rows]
    tx_hashes = [r[1] for r in rows]
    raw_vectors = [json.loads(r[2]) if isinstance(r[2], str) else r[2] for r in rows]

    numeric = np.array(
        [v[:NUMERIC_DIM] for v in raw_vectors], dtype=np.float64
    )
    categoricals = [str(v[CATEGORICAL_START]) for v in raw_vectors]

    return numeric, categoricals, tx_ids, tx_hashes


def prepare_feature_matrix(
    numeric: np.ndarray, categoricals: list[str]
) -> np.ndarray:
    """Prepare a unified numeric feature matrix for UMAP/HDBSCAN.

    Range-normalizes numeric features to [0,1] and label-encodes the
    categorical (fee payer) as a 0/1 column per unique value would be too
    wide, so instead we use a single column with values 0 or 1 indicating
    whether each tx shares the most common fee payer. This preserves the
    Gower intuition (same=close, different=far) without exploding dimensions.

    Actually, for better fidelity: we use frequency-based encoding where
    each category maps to its frequency ratio. Txs with the same fee payer
    get the same value (distance=0), different payers get different values,
    and rare payers are further from common ones — a reasonable proxy for
    Gower's simple matching in continuous space.

    Returns:
        (N, 15) float32 array ready for euclidean UMAP/HDBSCAN.
    """
    n = numeric.shape[0]
    n_num = numeric.shape[1] if numeric.ndim == 2 else 0

    # Range-normalize numeric features to [0, 1]
    if n_num > 0:
        ranges = np.ptp(numeric, axis=0)
        ranges[ranges == 0] = 1.0
        normed = (numeric / ranges).astype(np.float32)
    else:
        normed = np.zeros((n, 0), dtype=np.float32)

    # Frequency-encode the categorical feature
    # Each unique fee payer maps to its frequency fraction
    from collections import Counter
    counts = Counter(categoricals)
    freq_map = {k: v / n for k, v in counts.items()}
    cat_col = np.array([freq_map[c] for c in categoricals], dtype=np.float32).reshape(-1, 1)

    # Scale categorical column so it carries equal total weight to all numerics.
    # In Gower distance, each of 15 features has weight 1/15. With 14 numeric
    # columns and 1 categorical, the categorical should contribute 1/15 of total
    # distance — same as each numeric. Multiply by sqrt(14) so its squared
    # euclidean contribution matches the combined numeric contribution.
    cat_col *= np.sqrt(n_num) if n_num > 0 else 1.0

    return np.hstack([normed, cat_col])


def gower_distance_matrix(
    numeric: np.ndarray, categoricals: list[str]
) -> np.ndarray:
    """Compute a Gower distance matrix for mixed numeric + categorical data.

    WARNING: O(N²) memory — only use for small datasets (e.g. cluster recommend).

    Gower distance between two samples is the average of per-feature
    distances:
      - Numeric: |x_i - x_j| / range_i  (range-normalized Manhattan)
      - Categorical: 0 if same, 1 if different

    Returns:
        (N, N) symmetric distance matrix with zeros on the diagonal.
    """
    n = numeric.shape[0]
    n_num = numeric.shape[1] if numeric.ndim == 2 else 0
    n_cat = 1  # fee payer
    total_features = n_num + n_cat

    # Numeric contribution: range-normalize each column
    if n_num > 0:
        ranges = np.ptp(numeric, axis=0)
        # Constant features (range=0) contribute 0 distance
        ranges[ranges == 0] = 1.0
        normed = numeric / ranges

        # Pairwise Manhattan distance on normalized features
        num_dist = np.zeros((n, n), dtype=np.float64)
        for f in range(n_num):
            col = normed[:, f]
            num_dist += np.abs(col[:, None] - col[None, :])
    else:
        num_dist = np.zeros((n, n), dtype=np.float64)

    # Categorical contribution: simple matching (0 = same, 1 = different)
    cat_arr = np.array(categoricals)
    cat_dist = (cat_arr[:, None] != cat_arr[None, :]).astype(np.float64)

    # Gower = average of all per-feature distances
    return (num_dist + cat_dist) / total_features
