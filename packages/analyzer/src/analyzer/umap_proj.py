"""UMAP dimensionality reduction for visualization."""

import numpy as np
import umap


def compute_umap(
    data: np.ndarray,
    n_components: int = 2,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    metric: str = "euclidean",
    random_state: int | None = None,
) -> np.ndarray:
    """Project high-dimensional feature vectors to 2D/3D via UMAP.

    Args:
        data: (N, D) scaled feature vectors
        n_components: output dimensions (2 or 3)
        n_neighbors: controls local vs global structure
        min_dist: minimum distance between points in embedding
        metric: distance metric
        random_state: seed for reproducibility

    Returns:
        (N, n_components) array of projected coordinates
    """
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=metric,
        init="random",
        random_state=random_state,
        n_jobs=1,
    )
    return reducer.fit_transform(data)
