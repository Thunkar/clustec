FROM node:24-slim AS build
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

WORKDIR /app

# ── Layer 1: Node deps (changes when package.json/lockfile change) ──
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/common/package.json packages/common/
COPY packages/indexer/package.json packages/indexer/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN yarn install --immutable

# ── Layer 2: Build static assets (changes on code edits) ──
COPY tsconfig.base.json ./
COPY packages/web/ packages/web/
RUN yarn workspace @clustec/web build

# ── Final: serve with Caddy (static files + API proxy + auto TLS) ──
FROM caddy:2-alpine

COPY --from=build /app/packages/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
