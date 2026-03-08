"""Tests for the analysis pipeline components."""

import numpy as np
import pytest

from analyzer.features import scale_features
from analyzer.umap_proj import compute_umap
from analyzer.clustering import run_hdbscan


@pytest.fixture
def synthetic_data():
    """Create synthetic data with 2 clear clusters and some outliers."""
    rng = np.random.default_rng(42)
    cluster_a = rng.normal(0, 0.5, (30, 5))
    cluster_b = rng.normal(5, 0.5, (30, 5))
    outliers = rng.normal(20, 0.1, (3, 5))
    return np.vstack([cluster_a, cluster_b, outliers])


class TestScaleFeatures:
    def test_output_shape_preserved(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        assert scaled.shape == synthetic_data.shape

    def test_zero_mean_unit_variance(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        np.testing.assert_array_almost_equal(scaled.mean(axis=0), 0, decimal=10)
        np.testing.assert_array_almost_equal(scaled.std(axis=0), 1, decimal=10)

    def test_single_row_passthrough(self):
        single = np.array([[1.0, 2.0, 3.0]])
        result = scale_features(single)
        np.testing.assert_array_equal(result, single)


class TestUMAP:
    def test_output_dimensions(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        proj_2d = compute_umap(scaled, n_components=2, n_neighbors=10)
        assert proj_2d.shape == (63, 2)

        proj_3d = compute_umap(scaled, n_components=3, n_neighbors=10)
        assert proj_3d.shape == (63, 3)

    def test_deterministic_with_seed(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        proj1 = compute_umap(scaled, n_neighbors=10, random_state=42)
        proj2 = compute_umap(scaled, n_neighbors=10, random_state=42)
        np.testing.assert_array_almost_equal(proj1, proj2)


class TestHDBSCAN:
    def test_finds_clusters_in_clear_data(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        embedding = compute_umap(scaled, n_neighbors=10)
        labels, probs, outlier_scores = run_hdbscan(embedding, min_cluster_size=5)

        assert len(labels) == 63
        assert len(probs) == 63
        assert len(outlier_scores) == 63

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        # Should find at least 2 clusters (the two gaussian blobs)
        assert n_clusters >= 2

    def test_outlier_scores_bounded(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        embedding = compute_umap(scaled, n_neighbors=10)
        _, _, outlier_scores = run_hdbscan(embedding, min_cluster_size=5)

        assert np.all(outlier_scores >= 0)
        assert np.all(outlier_scores <= 1)

    def test_membership_scores_bounded(self, synthetic_data):
        scaled = scale_features(synthetic_data)
        embedding = compute_umap(scaled, n_neighbors=10)
        _, probs, _ = run_hdbscan(embedding, min_cluster_size=5)

        assert np.all(probs >= 0)
        assert np.all(probs <= 1)
