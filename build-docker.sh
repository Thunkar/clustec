#!/usr/bin/env bash
set -euo pipefail

# Builds and pushes multi-platform Docker images to Docker Hub.
#
# Usage:
#   ./build-docker.sh              # build & push :latest for amd64 + arm64
#   ./build-docker.sh v1.2.0       # build & push :v1.2.0
#   ./build-docker.sh --no-push    # build only (single platform, no push)

TAG="latest"
PUSH=true
PLATFORMS="linux/amd64,linux/arm64"
BUILDER="clustec-builder"

for arg in "$@"; do
  case "$arg" in
    --no-push)  PUSH=false ;;
    *)          TAG="$arg" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

IMAGES=(
  "thunkar/clustec-server|packages/server/Dockerfile"
  "thunkar/clustec-indexer|packages/indexer/Dockerfile"
  "thunkar/clustec-web|packages/web/Dockerfile"
)

# Ensure a buildx builder exists for multi-platform builds
if [[ "$PUSH" == true ]]; then
  if ! docker buildx inspect "$BUILDER" &>/dev/null; then
    echo "==> Creating buildx builder ($BUILDER)..."
    docker buildx create --name "$BUILDER" --use
  else
    docker buildx use "$BUILDER"
  fi
fi

echo "==> Building images (tag: $TAG, platforms: $PLATFORMS)..."
for entry in "${IMAGES[@]}"; do
  IFS='|' read -r repo dockerfile <<< "$entry"
  image="$repo:$TAG"

  if [[ "$PUSH" == true ]]; then
    echo "    Building & pushing $image..."
    docker buildx build \
      --platform "$PLATFORMS" \
      -f "$dockerfile" \
      -t "$image" \
      --push \
      "$SCRIPT_DIR"
  else
    echo "    Building $image (local only)..."
    docker build \
      -f "$dockerfile" \
      -t "$image" \
      "$SCRIPT_DIR"
  fi
done

echo "==> Done."
