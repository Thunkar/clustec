"""CLI entry point for the analyzer."""

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
):
    """Run clustering analysis on indexed transactions."""
    typer.echo(f"Running analysis for network '{network}'...")

    conn = get_connection()
    try:
        result = run_pipeline(
            conn,
            network,
            min_cluster_size=min_cluster_size,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            n_components=dimensions,
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
