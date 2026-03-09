#!/usr/bin/env bash
set -euo pipefail

# ─── Usage ────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --host HOST         SSH host (IP or hostname)             [required]
  --user USER         SSH user                              [default: root]
  --port PORT         SSH port                              [default: 22]
  --key  KEY          Path to SSH private key               [optional]
  --dir  DIR          Remote directory for deployment       [default: /opt/clustec]
  --platform PLAT     Docker build platform                 [default: linux/amd64]
  -h, --help          Show this help message

Example:
  $0 --host 192.168.1.100 --user deploy --key ~/.ssh/id_ed25519
EOF
  exit 0
}

# ─── Defaults ─────────────────────────────────────────────────────────
SSH_HOST=""
SSH_USER="root"
SSH_PORT="22"
SSH_KEY=""
REMOTE_DIR="/opt/clustec"
PLATFORM="linux/amd64"

# ─── Parse args ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)     SSH_HOST="$2";     shift 2 ;;
    --user)     SSH_USER="$2";     shift 2 ;;
    --port)     SSH_PORT="$2";     shift 2 ;;
    --key)      SSH_KEY="$2";      shift 2 ;;
    --dir)      REMOTE_DIR="$2";   shift 2 ;;
    --platform) PLATFORM="$2";    shift 2 ;;
    -h|--help)  usage ;;
    *)          echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$SSH_HOST" ]]; then
  echo "Error: --host is required"
  usage
fi

# ─── SSH / SCP helpers ───────────────────────────────────────────────
SSH_OPTS="-o StrictHostKeyChecking=accept-new -p $SSH_PORT"
SCP_OPTS="-O -o StrictHostKeyChecking=accept-new -P $SSH_PORT"
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
  SCP_OPTS="$SCP_OPTS -i $SSH_KEY"
fi

remote() {
  ssh $SSH_OPTS "$SSH_USER@$SSH_HOST" "export PATH=\"/usr/local/bin:/usr/syno/bin:\$PATH\"; $*"
}

send() {
  scp $SCP_OPTS "$1" "$SSH_USER@$SSH_HOST:$2"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGES_TAR="$SCRIPT_DIR/.deploy-images.tar.gz"

# ─── Step 1: Build images locally ────────────────────────────────────
echo "==> Building Docker images for $PLATFORM..."

docker build --platform "$PLATFORM" \
  -f packages/server/Dockerfile \
  -t clustec-server:latest \
  "$SCRIPT_DIR"

docker build --platform "$PLATFORM" \
  -f packages/indexer/Dockerfile \
  -t clustec-indexer:latest \
  "$SCRIPT_DIR"

docker build --platform "$PLATFORM" \
  -f packages/web/Dockerfile \
  -t clustec-web:latest \
  "$SCRIPT_DIR"

# ─── Step 2: Save images to tar.gz ───────────────────────────────────
echo "==> Saving images to archive..."
docker save clustec-server:latest clustec-indexer:latest clustec-web:latest \
  | gzip > "$IMAGES_TAR"

SIZE=$(du -h "$IMAGES_TAR" | cut -f1)
echo "    Archive: $SIZE"

# ─── Step 3: Ensure Docker is available on remote ──────────────────
echo "==> Checking Docker on remote..."
remote "docker --version" || {
  echo "Error: Docker not found on remote. Install it manually (e.g. Synology Package Center → Container Manager)."
  exit 1
}

# ─── Step 4: Prepare remote directory ────────────────────────────────
echo "==> Preparing remote directory $REMOTE_DIR..."
remote "mkdir -p $REMOTE_DIR/configs/networks"

# ─── Step 5: Transfer files ──────────────────────────────────────────
echo "==> Uploading images archive..."
send "$IMAGES_TAR" "$REMOTE_DIR/images.tar.gz"

echo "==> Uploading compose and configs..."
send "$SCRIPT_DIR/docker-compose.yml"  "$REMOTE_DIR/docker-compose.yml"
send "$SCRIPT_DIR/.env.example"        "$REMOTE_DIR/.env.example"

# Upload network configs
for f in "$SCRIPT_DIR"/configs/networks/*.json; do
  [ -f "$f" ] && send "$f" "$REMOTE_DIR/configs/networks/$(basename "$f")"
done

# ─── Step 6: Load images on remote ──────────────────────────────────
echo "==> Loading images on remote..."
remote "docker load -i $REMOTE_DIR/images.tar.gz"

# ─── Step 7: Create .env if missing ─────────────────────────────────
remote "[ -f $REMOTE_DIR/.env ] || cp $REMOTE_DIR/.env.example $REMOTE_DIR/.env"

# ─── Step 8: Start services ─────────────────────────────────────────
echo "==> Starting services..."
remote "cd $REMOTE_DIR && docker compose -f docker-compose.yml up -d"

# ─── Step 9: Cleanup ────────────────────────────────────────────────
echo "==> Cleaning up..."
rm -f "$IMAGES_TAR"
remote "rm -f $REMOTE_DIR/images.tar.gz"

echo ""
echo "==> Deploy complete!"
remote "cd $REMOTE_DIR && docker compose -f docker-compose.yml ps"
