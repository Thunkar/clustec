"""CLI entry point for the analyzer."""

import json
from typing import Optional

import typer

from .db import get_connection
from .pipeline import run_pipeline

app = typer.Typer(help="Clustec transaction analyzer")


@app.command()
def run(
    network: str = typer.Argument(help="Network ID (e.g. 'devnet')"),
    min_cluster_size: int = typer.Option(5, help="Minimum cluster size for HDBSCAN"),
    n_neighbors: int = typer.Option(15, help="UMAP n_neighbors parameter"),
    min_dist: float = typer.Option(0.1, help="UMAP min_dist parameter"),
    dimensions: int = typer.Option(3, help="UMAP output dimensions (2 or 3)"),
    weights: Optional[str] = typer.Option(None, help="JSON object mapping feature names to weights"),
    normalization: str = typer.Option("minmax", help="Normalization mode: minmax or rank"),
):
    """Run clustering analysis on indexed transactions."""
    typer.echo(f"Running analysis for network '{network}'...")

    parsed_weights: dict[str, float] | None = None
    if weights:
        parsed_weights = json.loads(weights)

    conn = get_connection()
    try:
        result = run_pipeline(
            conn,
            network,
            min_cluster_size=min_cluster_size,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            n_components=dimensions,
            weights=parsed_weights,
            normalization=normalization,
        )
    finally:
        conn.close()

    if "error" in result:
        typer.echo(f"Error: {result['error']}", err=True)
        raise typer.Exit(1)

    typer.echo(f"Analysis complete:")
    typer.echo(f"  Run ID:       {result['run_id']}")
    typer.echo(f"  Transactions: {result['num_txs']}")
    typer.echo(f"  Clusters:     {result['num_clusters']}")
    typer.echo(f"  Outliers:     {result['num_outliers']}")


if __name__ == "__main__":
    app()
