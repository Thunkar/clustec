import os
import psycopg


def get_connection_string() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return url


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_connection_string())
