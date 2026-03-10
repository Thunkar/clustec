ARG BASE_IMAGE=thunkar/clustec-base:latest
FROM ${BASE_IMAGE}

# ── Build source ──
COPY tsconfig.base.json ./
COPY packages/common/ packages/common/
COPY packages/indexer/ packages/indexer/
RUN yarn workspace @clustec/common build && yarn workspace @clustec/indexer build

CMD ["node", "--experimental-transform-types", "packages/indexer/src/main.ts", "--config", "/app/config.json"]
