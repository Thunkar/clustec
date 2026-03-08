"""Full analysis pipeline: load features → scale → UMAP → HDBSCAN → store."""

import json
from datetime import datetime, timezone

import numpy as np
import psycopg

from .features import load_features, scale_features
from .umap_proj import compute_umap
from .clustering import run_hdbscan


def run_pipeline(
    conn: psycopg.Connection,
    network_id: str,
    min_cluster_size: int = 5,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    n_components: int = 3,
) -> dict:
    """Run the full analysis pipeline for a network.

    Returns a summary dict with cluster/outlier counts.
    """
    # 1. Load features
    vectors, tx_ids, tx_hashes = load_features(conn, network_id)
    if len(tx_ids) < min_cluster_size:
        return {
            "error": f"Not enough transactions ({len(tx_ids)}) for clustering (need >= {min_cluster_size})",
            "num_txs": len(tx_ids),
        }

    # 2. Scale
    scaled = scale_features(vectors)

    # 3. UMAP projection
    embedding = compute_umap(
        scaled,
        n_components=n_components,
        n_neighbors=min(n_neighbors, len(tx_ids) - 1),
        min_dist=min_dist,
    )

    # 4. Cluster on the scaled feature vectors (not the UMAP embedding,
    #    which is lossy and intended only for visualization)
    labels, membership_scores, outlier_scores = run_hdbscan(
        scaled, min_cluster_size=min_cluster_size
    )

    # 5. Store results
    num_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    num_outliers = int(np.sum(labels == -1))

    params = {
        "min_cluster_size": min_cluster_size,
        "n_neighbors": n_neighbors,
        "min_dist": min_dist,
        "n_components": n_components,
    }

    with conn.cursor() as cur:
        # Create cluster run
        cur.execute(
            """
            INSERT INTO cluster_runs (network_id, algorithm, params, num_clusters, num_outliers, computed_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                network_id,
                "hdbscan",
                json.dumps(params),
                num_clusters,
                num_outliers,
                datetime.now(timezone.utc),
            ),
        )
        run_id = cur.fetchone()[0]

        # Batch insert memberships
        membership_data = [
            (run_id, tx_ids[i], int(labels[i]), float(membership_scores[i]), float(outlier_scores[i]))
            for i in range(len(tx_ids))
        ]
        cur.executemany(
            """
            INSERT INTO cluster_memberships (run_id, tx_id, cluster_id, membership_score, outlier_score)
            VALUES (%s, %s, %s, %s, %s)
            """,
            membership_data,
        )

        # Batch insert UMAP projections
        if n_components == 2:
            proj_data = [
                (run_id, tx_ids[i], float(embedding[i, 0]), float(embedding[i, 1]), None)
                for i in range(len(tx_ids))
            ]
        else:
            proj_data = [
                (run_id, tx_ids[i], float(embedding[i, 0]), float(embedding[i, 1]), float(embedding[i, 2]))
                for i in range(len(tx_ids))
            ]

        cur.executemany(
            """
            INSERT INTO umap_projections (run_id, tx_id, x, y, z)
            VALUES (%s, %s, %s, %s, %s)
            """,
            proj_data,
        )

    conn.commit()

    return {
        "run_id": run_id,
        "num_txs": len(tx_ids),
        "num_clusters": num_clusters,
        "num_outliers": num_outliers,
        "params": params,
    }
