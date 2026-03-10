ARG BASE_IMAGE=thunkar/clustec-base:latest
FROM ${BASE_IMAGE} AS build

# ── Build static assets ──
COPY tsconfig.base.json ./
COPY packages/web/ packages/web/
RUN yarn workspace @clustec/web build

# ── Final: serve with Caddy ──
FROM caddy:2-alpine

COPY --from=build /app/packages/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
