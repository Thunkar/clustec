ARG BASE_IMAGE=thunkar/clustec-base:latest
FROM ${BASE_IMAGE} AS build

ARG VITE_SENTRY_DSN=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
ARG SENTRY_AUTH_TOKEN=""

# ── Build static assets ──
COPY tsconfig.base.json ./
COPY packages/web/ packages/web/
RUN yarn workspace @clustec/web build

# ── Final: serve with Caddy ──
FROM caddy:2-alpine

COPY --from=build /app/packages/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
