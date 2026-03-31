"""Full analysis pipeline: load features → normalize → UMAP → HDBSCAN → store."""

import json
from datetime import datetime, timezone

import numpy as np
import psycopg

from .features import load_features, prepare_feature_matrix, NUMERIC_DIM
from .umap_proj import compute_umap
from .clustering import run_hdbscan
from collections import Counter


def run_pipeline(
    conn: psycopg.Connection,
    network_id: str,
    min_cluster_size: int = 5,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    n_components: int = 3,
    weights: dict[str, float] | None = None,
    normalization: str = "minmax",
) -> dict:
    """Run the full analysis pipeline for a network.

    Uses feature-space UMAP (approximate NN) instead of precomputed
    distance matrices to scale to large datasets without O(N²) memory.

    Returns a summary dict with cluster/outlier counts.
    """
    # 1. Load features (numeric + categorical)
    numeric, categoricals, tx_ids, _ = load_features(conn, network_id)
    if len(tx_ids) < min_cluster_size:
        return {
            "error": f"Not enough transactions ({len(tx_ids)}) for clustering (need >= {min_cluster_size})",
            "num_txs": len(tx_ids),
        }

    # 2. Prepare unified numeric feature matrix (range-normalized + encoded categoricals)
    features = prepare_feature_matrix(numeric, categoricals, weights=weights, normalization=normalization)

    # 3. Cluster on the full feature matrix (15D euclidean — O(N log N), no N×N matrix)
    labels, membership_scores, outlier_scores = run_hdbscan(
        features, min_cluster_size=min_cluster_size, metric="euclidean"
    )

    # 4. UMAP projection for visualization only (does not affect clustering)
    embedding = compute_umap(
        features,
        n_components=n_components,
        n_neighbors=min(n_neighbors, len(tx_ids) - 1),
        min_dist=min_dist,
        spread=3.0,
        metric="euclidean",
    )

    # 5. Compute cluster centroids (median numeric, mode categorical)
    # These are stored with the run so the server doesn't need to reload all vectors.
    cluster_data: dict[int, dict] = {}
    for i in range(len(tx_ids)):
        cid = int(labels[i])
        if cid == -1:
            continue
        if cid not in cluster_data:
            cluster_data[cid] = {"numeric": [], "categoricals": [], "tx_ids": []}
        cluster_data[cid]["numeric"].append(numeric[i])
        cluster_data[cid]["categoricals"].append(categoricals[i])
        cluster_data[cid]["tx_ids"].append(tx_ids[i])

    # Global ranges for Gower normalization
    ranges = []
    for d in range(NUMERIC_DIM):
        col = numeric[:, d]
        ranges.append(float(np.ptp(col)))

    centroids_json = []
    for cid, data in sorted(cluster_data.items()):
        num_arr = np.array(data["numeric"])
        centroid = []
        for d in range(NUMERIC_DIM):
            sorted_col = np.sort(num_arr[:, d])
            mid = len(sorted_col) // 2
            if len(sorted_col) % 2 == 0:
                centroid.append(float((sorted_col[mid - 1] + sorted_col[mid]) / 2))
            else:
                centroid.append(float(sorted_col[mid]))
        # Categorical: mode
        counts = Counter(data["categoricals"])
        mode_cat = counts.most_common(1)[0][0]
        centroid.append(mode_cat)

        centroids_json.append({
            "clusterId": cid,
            "centroid": centroid,
            "count": len(data["numeric"]),
        })

    stored_centroids = {"centroids": centroids_json, "ranges": ranges}

    # 6. Store results
    num_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    num_outliers = int(np.sum(labels == -1))

    params = {
        "min_cluster_size": min_cluster_size,
        "n_neighbors": n_neighbors,
        "min_dist": min_dist,
        "n_components": n_components,
        "distance": "euclidean-on-features",
    }

    with conn.cursor() as cur:
        # Create cluster run
        cur.execute(
            """
            INSERT INTO cluster_runs (network_id, algorithm, params, num_clusters, num_outliers, centroids, computed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                network_id,
                "hdbscan",
                json.dumps(params),
                num_clusters,
                num_outliers,
                json.dumps(stored_centroids),
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

        # Clean up old runs for this network (keep latest 5)
        cur.execute(
            """
            DELETE FROM umap_projections WHERE run_id IN (
                SELECT id FROM cluster_runs
                WHERE network_id = %s AND id NOT IN (
                    SELECT id FROM cluster_runs WHERE network_id = %s ORDER BY computed_at DESC LIMIT 5
                )
            )
            """,
            (network_id, network_id),
        )
        cur.execute(
            """
            DELETE FROM cluster_memberships WHERE run_id IN (
                SELECT id FROM cluster_runs
                WHERE network_id = %s AND id NOT IN (
                    SELECT id FROM cluster_runs WHERE network_id = %s ORDER BY computed_at DESC LIMIT 5
                )
            )
            """,
            (network_id, network_id),
        )
        cur.execute(
            """
            DELETE FROM cluster_runs
            WHERE network_id = %s AND id NOT IN (
                SELECT id FROM cluster_runs WHERE network_id = %s ORDER BY computed_at DESC LIMIT 5
            )
            """,
            (network_id, network_id),
        )

    conn.commit()

    return {
        "run_id": run_id,
        "num_txs": len(tx_ids),
        "num_clusters": num_clusters,
        "num_outliers": num_outliers,
        "params": params,
    }
