"""Load and prepare feature vectors from the database."""

import json

import numpy as np
import psycopg
from sklearn.preprocessing import StandardScaler


def load_features(
    conn: psycopg.Connection, network_id: str
) -> tuple[np.ndarray, list[int], list[str]]:
    """Load feature vectors for a network.

    Returns:
        vectors: (N, D) array of feature vectors
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
        return np.array([]), [], []

    tx_ids = [r[0] for r in rows]
    tx_hashes = [r[1] for r in rows]
    raw_vectors = [json.loads(r[2]) if isinstance(r[2], str) else r[2] for r in rows]

    # Feature vector changed from 16-dim (with public inputs) to 11-dim (tx effect only).
    # Truncate old vectors so all rows have consistent dimensions.
    FEATURE_DIM = 11
    raw_vectors = [v[:FEATURE_DIM] for v in raw_vectors]
    vectors = np.array(raw_vectors, dtype=np.float64)

    return vectors, tx_ids, tx_hashes


def scale_features(vectors: np.ndarray) -> np.ndarray:
    """Standardize features to zero mean and unit variance."""
    if vectors.shape[0] < 2:
        return vectors
    scaler = StandardScaler()
    return scaler.fit_transform(vectors)
