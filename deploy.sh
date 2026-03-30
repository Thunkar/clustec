#!/usr/bin/env bash
set -euo pipefail

# Deploys to a remote server: uploads configs, pulls images, restarts services.
# Images must already be pushed (run build:docker first).
#
# Usage:
#   ./deploy.sh --host 1.2.3.4
#   ./deploy.sh --host 1.2.3.4 --tag v1.2.0 --key ~/.ssh/id_ed25519

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --host HOST         SSH host (IP or hostname)             [required]
  --user USER         SSH user                              [default: root]
  --port PORT         SSH port                              [default: 22]
  --key  KEY          Path to SSH private key               [optional]
  --dir  DIR          Remote directory for deployment       [default: /opt/clustec]
  --tag  TAG          Image tag to deploy                   [default: latest]
  -h, --help          Show this help message
EOF
  exit 0
}

SSH_HOST=""
SSH_USER="root"
SSH_PORT="22"
SSH_KEY=""
REMOTE_DIR="/opt/clustec"
IMAGE_TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SSH_HOST="$2";    shift 2 ;;
    --user) SSH_USER="$2";    shift 2 ;;
    --port) SSH_PORT="$2";    shift 2 ;;
    --key)  SSH_KEY="$2";     shift 2 ;;
    --dir)  REMOTE_DIR="$2";  shift 2 ;;
    --tag)  IMAGE_TAG="$2";   shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$SSH_HOST" ]]; then
  echo "Error: --host is required"
  usage
fi

IMAGES=(
  "thunkar/clustec-server:$IMAGE_TAG"
  "thunkar/clustec-indexer:$IMAGE_TAG"
  "thunkar/clustec-web:$IMAGE_TAG"
)

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

# ─── 1. Check remote ─────────────────────────────────────────────────
echo "==> Waiting for server to be ready..."
remote "command -v cloud-init >/dev/null 2>&1 && { echo 'Waiting for cloud-init...'; cloud-init status --wait; } || true"

remote "docker compose version" || {
  echo "Error: 'docker compose' not available on remote."
  exit 1
}

# ─── 2. Upload configs ───────────────────────────────────────────────
echo "==> Uploading configs..."
remote "mkdir -p $REMOTE_DIR/configs/networks"

send "$SCRIPT_DIR/docker-compose.yml"  "$REMOTE_DIR/docker-compose.yml"
send "$SCRIPT_DIR/Caddyfile"           "$REMOTE_DIR/Caddyfile"
send "$SCRIPT_DIR/.env.example"        "$REMOTE_DIR/.env.example"

for f in "$SCRIPT_DIR"/configs/networks/*.json; do
  [ -f "$f" ] && send "$f" "$REMOTE_DIR/configs/networks/$(basename "$f")"
done

# ─── 3. Pull images ──────────────────────────────────────────────────
echo "==> Pulling images (tag: $IMAGE_TAG)..."
for img in "${IMAGES[@]}"; do
  remote "docker pull $img"
done

# ─── 4. Set IMAGE_TAG and secrets in .env ────────────────────────────
remote "[ -f $REMOTE_DIR/.env ] || cp $REMOTE_DIR/.env.example $REMOTE_DIR/.env"
remote "grep -q '^IMAGE_TAG=' $REMOTE_DIR/.env 2>/dev/null && sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=$IMAGE_TAG|' $REMOTE_DIR/.env || echo 'IMAGE_TAG=$IMAGE_TAG' >> $REMOTE_DIR/.env"

# Upsert optional env vars if set locally
for VAR in SENTRY_DSN NODE_URL_MAINNET; do
  VAL="${!VAR}"
  if [[ -n "$VAL" ]]; then
    remote "grep -q '^${VAR}=' $REMOTE_DIR/.env 2>/dev/null && sed -i 's|^${VAR}=.*|${VAR}=${VAL}|' $REMOTE_DIR/.env || echo '${VAR}=${VAL}' >> $REMOTE_DIR/.env"
  fi
done

#─── 5. Restart services ─────────────────────────────────────────────
echo "==> Starting services..."
remote "cd $REMOTE_DIR && docker compose up -d"

echo ""
echo "==> Deploy complete!"
remote "cd $REMOTE_DIR && docker compose ps"
