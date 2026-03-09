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

# ── Final: serve with nginx ──
FROM nginx:alpine

COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
