"""Tests for the analysis pipeline components."""

import numpy as np
import pytest

from analyzer.features import gower_distance_matrix
from analyzer.umap_proj import compute_umap
from analyzer.clustering import run_hdbscan


# ── Fixtures ──────────────────────────────────────────────────


@pytest.fixture
def two_clusters():
    """Two clear numeric clusters with different categorical labels."""
    rng = np.random.default_rng(42)
    # Cluster A: low values, fee payer "0xAAA"
    numeric_a = rng.normal(0, 0.5, (30, 14))
    cats_a = ["0xAAA"] * 30
    # Cluster B: high values, fee payer "0xBBB"
    numeric_b = rng.normal(5, 0.5, (30, 14))
    cats_b = ["0xBBB"] * 30
    # Outliers: extreme values, third fee payer
    numeric_out = rng.normal(20, 0.1, (3, 14))
    cats_out = ["0xCCC"] * 3

    numeric = np.vstack([numeric_a, numeric_b, numeric_out])
    cats = cats_a + cats_b + cats_out
    return numeric, cats


# ── Gower Distance ────────────────────────────────────────────


class TestGowerDistance:
    def test_output_shape(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        assert dist.shape == (63, 63)

    def test_symmetric(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        np.testing.assert_array_almost_equal(dist, dist.T)

    def test_zero_diagonal(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        np.testing.assert_array_almost_equal(np.diag(dist), 0)

    def test_bounded_zero_to_one(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        assert np.all(dist >= 0)
        assert np.all(dist <= 1)

    def test_identical_rows_have_zero_distance(self):
        numeric = np.array([[1.0, 2.0, 3.0], [1.0, 2.0, 3.0], [5.0, 6.0, 7.0]])
        cats = ["0xA", "0xA", "0xB"]
        dist = gower_distance_matrix(numeric, cats)
        assert dist[0, 1] == 0.0  # same numeric + same categorical

    def test_categorical_difference_adds_distance(self):
        # Same numeric features, different fee payer
        numeric = np.array([[1.0, 2.0], [1.0, 2.0]])
        cats = ["0xA", "0xB"]
        dist = gower_distance_matrix(numeric, cats)
        # Numeric distance is 0, categorical distance is 1
        # Gower = (0 + 0 + 1) / 3 = 1/3
        assert dist[0, 1] == pytest.approx(1.0 / 3.0)

    def test_same_category_no_categorical_distance(self):
        numeric = np.array([[0.0, 0.0], [1.0, 1.0]])
        cats = ["0xA", "0xA"]
        dist = gower_distance_matrix(numeric, cats)
        # All numeric ranges are 1, so each dim contributes |0-1|/1 = 1
        # Gower = (1 + 1 + 0) / 3 = 2/3
        assert dist[0, 1] == pytest.approx(2.0 / 3.0)

    def test_constant_numeric_features(self):
        # When a numeric feature has zero range, it contributes 0 distance
        numeric = np.array([[5.0], [5.0], [5.0]])
        cats = ["0xA", "0xA", "0xB"]
        dist = gower_distance_matrix(numeric, cats)
        assert dist[0, 1] == 0.0   # same cat, constant numeric
        assert dist[0, 2] == pytest.approx(0.5)  # different cat: (0 + 1) / 2

    def test_same_fee_payer_groups_together(self):
        numeric = np.array([[1.0], [1.0], [1.0]])
        cats = ["0xAAA", "0xAAA", "0xBBB"]
        dist = gower_distance_matrix(numeric, cats)
        assert dist[0, 1] == 0.0   # same fee payer, same numeric
        assert dist[0, 2] > 0.0    # different fee payer


# ── UMAP with precomputed distance ───────────────────────────


class TestUMAP:
    def test_output_dimensions_precomputed(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        proj_2d = compute_umap(dist, n_components=2, n_neighbors=10, metric="precomputed")
        assert proj_2d.shape == (63, 2)

        proj_3d = compute_umap(dist, n_components=3, n_neighbors=10, metric="precomputed")
        assert proj_3d.shape == (63, 3)

    def test_deterministic_with_seed(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        proj1 = compute_umap(dist, n_neighbors=10, metric="precomputed", random_state=42)
        proj2 = compute_umap(dist, n_neighbors=10, metric="precomputed", random_state=42)
        np.testing.assert_array_almost_equal(proj1, proj2)


# ── HDBSCAN with precomputed distance ────────────────────────


class TestHDBSCAN:
    def test_finds_clusters_in_clear_data(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        labels, probs, outlier_scores = run_hdbscan(
            dist, min_cluster_size=5, metric="precomputed"
        )

        assert len(labels) == 63
        assert len(probs) == 63
        assert len(outlier_scores) == 63

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        assert n_clusters >= 2

    def test_outlier_scores_bounded(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        _, _, outlier_scores = run_hdbscan(
            dist, min_cluster_size=5, metric="precomputed"
        )
        assert np.all(outlier_scores >= 0)
        assert np.all(outlier_scores <= 1)

    def test_membership_scores_bounded(self, two_clusters):
        numeric, cats = two_clusters
        dist = gower_distance_matrix(numeric, cats)
        _, probs, _ = run_hdbscan(
            dist, min_cluster_size=5, metric="precomputed"
        )
        assert np.all(probs >= 0)
        assert np.all(probs <= 1)


# ── Centroid computation ────────────────────────────────────

from analyzer.features import NUMERIC_DIM
from collections import Counter


class TestCentroidComputation:
    """Test the centroid computation logic used in the pipeline."""

    def _compute_centroids(self, numeric, categoricals, labels, tx_ids):
        """Mirror the centroid computation from pipeline.py."""
        cluster_data: dict[int, dict] = {}
        for i in range(len(tx_ids)):
            cid = int(labels[i])
            if cid == -1:
                continue
            if cid not in cluster_data:
                cluster_data[cid] = {"numeric": [], "categoricals": []}
            cluster_data[cid]["numeric"].append(numeric[i])
            cluster_data[cid]["categoricals"].append(categoricals[i])

        ranges = [float(np.ptp(numeric[:, d])) for d in range(numeric.shape[1])]

        centroids = []
        for cid, data in sorted(cluster_data.items()):
            num_arr = np.array(data["numeric"])
            centroid = []
            for d in range(num_arr.shape[1]):
                sorted_col = np.sort(num_arr[:, d])
                mid = len(sorted_col) // 2
                if len(sorted_col) % 2 == 0:
                    centroid.append(float((sorted_col[mid - 1] + sorted_col[mid]) / 2))
                else:
                    centroid.append(float(sorted_col[mid]))
            counts = Counter(data["categoricals"])
            centroid.append(counts.most_common(1)[0][0])
            centroids.append({"clusterId": cid, "centroid": centroid, "count": len(data["numeric"])})

        return centroids, ranges

    def test_median_numeric_centroid(self):
        """Centroid should be the median of each numeric dimension."""
        numeric = np.array([
            [1.0, 10.0],
            [3.0, 30.0],
            [5.0, 50.0],
        ])
        cats = ["0xA", "0xA", "0xA"]
        labels = np.array([0, 0, 0])
        tx_ids = [1, 2, 3]

        centroids, _ = self._compute_centroids(numeric, cats, labels, tx_ids)
        assert len(centroids) == 1
        c = centroids[0]
        assert c["clusterId"] == 0
        assert c["count"] == 3
        # Median of [1,3,5] = 3, median of [10,30,50] = 30
        assert c["centroid"][0] == 3.0
        assert c["centroid"][1] == 30.0

    def test_median_even_count(self):
        """Median of even count should average the two middle values."""
        numeric = np.array([
            [1.0],
            [2.0],
            [3.0],
            [4.0],
        ])
        cats = ["0xA"] * 4
        labels = np.array([0, 0, 0, 0])
        tx_ids = [1, 2, 3, 4]

        centroids, _ = self._compute_centroids(numeric, cats, labels, tx_ids)
        # Median of [1,2,3,4] = (2+3)/2 = 2.5
        assert centroids[0]["centroid"][0] == 2.5

    def test_categorical_mode(self):
        """Categorical centroid should be the most common value."""
        numeric = np.array([[0.0]] * 5)
        cats = ["0xA", "0xA", "0xB", "0xA", "0xB"]
        labels = np.array([0, 0, 0, 0, 0])
        tx_ids = list(range(5))

        centroids, _ = self._compute_centroids(numeric, cats, labels, tx_ids)
        assert centroids[0]["centroid"][-1] == "0xA"  # 3 vs 2

    def test_multiple_clusters(self):
        """Should produce one centroid per cluster, excluding outliers."""
        numeric = np.array([
            [0.0], [1.0], [2.0],  # cluster 0
            [10.0], [11.0],       # cluster 1
            [99.0],               # outlier
        ])
        cats = ["0xA"] * 3 + ["0xB"] * 2 + ["0xC"]
        labels = np.array([0, 0, 0, 1, 1, -1])
        tx_ids = list(range(6))

        centroids, ranges = self._compute_centroids(numeric, cats, labels, tx_ids)
        assert len(centroids) == 2

        c0 = next(c for c in centroids if c["clusterId"] == 0)
        c1 = next(c for c in centroids if c["clusterId"] == 1)
        assert c0["count"] == 3
        assert c0["centroid"][0] == 1.0  # median of [0,1,2]
        assert c0["centroid"][-1] == "0xA"
        assert c1["count"] == 2
        assert c1["centroid"][0] == 10.5  # median of [10,11]
        assert c1["centroid"][-1] == "0xB"

    def test_ranges(self):
        """Ranges should be max - min per dimension across ALL points (including outliers)."""
        numeric = np.array([
            [0.0, 5.0],
            [10.0, 5.0],
            [100.0, 15.0],  # outlier, but contributes to range
        ])
        cats = ["0xA"] * 3
        labels = np.array([0, 0, -1])
        tx_ids = [1, 2, 3]

        _, ranges = self._compute_centroids(numeric, cats, labels, tx_ids)
        assert ranges[0] == 100.0  # 100 - 0
        assert ranges[1] == 10.0   # 15 - 5
