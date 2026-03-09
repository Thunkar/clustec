FROM node:24-slim AS base
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Install uv for the Python analyzer (server shells out to it)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Python + C compiler (hdbscan has Cython extensions)
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-dev build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Layer 1: Python deps (changes rarely, slow to build) ──
COPY packages/analyzer/pyproject.toml packages/analyzer/uv.lock packages/analyzer/
RUN cd packages/analyzer && uv sync --frozen --no-install-project

# ── Layer 2: Node deps (changes when package.json/lockfile change) ──
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/common/package.json packages/common/
COPY packages/server/package.json packages/server/
COPY packages/indexer/package.json packages/indexer/
COPY packages/web/package.json packages/web/
RUN yarn install --immutable

# ── Layer 3: Build Node source (changes on code edits) ──
COPY tsconfig.base.json ./
COPY packages/common/ packages/common/
COPY packages/server/ packages/server/
RUN yarn workspace @clustec/common build && yarn workspace @clustec/server build

# ── Layer 4: Install analyzer project (source changed) ──
COPY packages/analyzer/src/ packages/analyzer/src/
RUN cd packages/analyzer && uv sync --frozen

# ── Layer 5: Runtime configs (change independently, no rebuild needed) ──
COPY configs/ configs/

ENV NODE_ENV=production

CMD ["node", "--import", "tsx/esm", "packages/server/src/main.ts"]
