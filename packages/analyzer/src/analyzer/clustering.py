"""Clustering algorithms for transaction analysis."""

import warnings

import numpy as np
import hdbscan


def run_hdbscan(
    data: np.ndarray,
    min_cluster_size: int = 5,
    min_samples: int | None = None,
    metric: str = "euclidean",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run HDBSCAN clustering on the data.

    Args:
        data: (N, D) feature vectors or (N, N) precomputed distance matrix
        min_cluster_size: minimum cluster size
        min_samples: minimum samples for core points (defaults to min_cluster_size)
        metric: distance metric ("euclidean" or "precomputed")

    Returns:
        labels: cluster labels (-1 = outlier)
        membership_scores: soft cluster membership probabilities
        outlier_scores: per-point outlier scores (higher = more outlier-like)
    """
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric=metric,
        core_dist_n_jobs=-1,
    )

    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", "invalid value encountered", RuntimeWarning)
        clusterer.fit(data)

    outlier_scores = np.nan_to_num(clusterer.outlier_scores_, nan=0.0)

    return (
        clusterer.labels_,
        clusterer.probabilities_,
        outlier_scores,
    )
