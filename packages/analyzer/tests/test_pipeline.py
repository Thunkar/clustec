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
