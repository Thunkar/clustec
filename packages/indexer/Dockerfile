FROM node:24-slim
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

WORKDIR /app

# ── Layer 1: Node deps (changes when package.json/lockfile change) ──
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/common/package.json packages/common/
COPY packages/indexer/package.json packages/indexer/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN yarn install --immutable

# ── Layer 2: Build source (changes on code edits) ──
COPY tsconfig.base.json ./
COPY packages/common/ packages/common/
COPY packages/indexer/ packages/indexer/
RUN yarn workspace @clustec/common build && yarn workspace @clustec/indexer build

CMD ["node", "--import", "tsx/esm", "packages/indexer/src/main.ts", "--config", "/app/config.json"]
