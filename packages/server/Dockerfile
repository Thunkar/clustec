ARG BASE_IMAGE=thunkar/clustec-base:latest
FROM ${BASE_IMAGE}

# ── Build Node source ──
COPY tsconfig.base.json ./
COPY packages/common/ packages/common/
COPY packages/server/ packages/server/
RUN yarn workspace @clustec/common build && yarn workspace @clustec/server build

# ── Install analyzer project ──
COPY packages/analyzer/src/ packages/analyzer/src/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd packages/analyzer && uv sync --frozen

# ── Runtime configs ──
COPY configs/ configs/

ENV NODE_ENV=production

CMD ["node", "--experimental-transform-types", "packages/server/src/main.ts"]
