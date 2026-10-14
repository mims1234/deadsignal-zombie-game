#!/usr/bin/env bash
# Deploy the current origin/main on the server: update the checkout, install, build, restart, and check that the
# server answers. Run from anywhere:  bash scripts/deploy.sh
# Local edits to tracked files on the server are discarded; .env and data/ are untracked and are never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

# An SSH command does not load the interactive shell setup, so node / pnpm / pm2 installed through nvm or pnpm's own
# installer are not on PATH yet. Bring in the usual locations.
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PATH="$PNPM_HOME:$HOME/.local/bin:/usr/local/bin:$PATH"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  set +u
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" > /dev/null
  set -u
fi
for tool in node pnpm pm2; do
  if ! command -v "$tool" > /dev/null 2>&1; then
    echo "$tool was not found on PATH for this non-interactive shell." >&2
    echo "Find it on the server with:  which $tool   and add that folder to PATH near the top of scripts/deploy.sh" >&2
    exit 127
  fi
done

APP="${PM2_APP:-zombies}"
PORT="${PORT:-3061}"

echo "==> updating to origin/main"
git fetch --quiet origin main
git checkout --quiet -B main origin/main
echo "    now at $(git log -1 --format='%h %s')"

echo "==> installing"
pnpm install --frozen-lockfile

echo "==> building"
pnpm build

# Co-op sessions live in the server's memory, so a restart ends them. Wait for them to finish first (up to
# DEPLOY_WAIT_MINUTES, default 30); after that the restart goes ahead and players are told why.
WAIT_MIN="${DEPLOY_WAIT_MINUTES:-30}"
for i in $(seq 1 $((WAIT_MIN * 6))); do
  OPEN=$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -o '"rooms":[0-9]*' | cut -d: -f2 || true)
  if [ -z "$OPEN" ] || [ "$OPEN" = "0" ]; then break; fi
  [ $((i % 6)) -eq 1 ] && echo "    $OPEN co-op session(s) open - waiting for them to end before restarting"
  sleep 10
done

echo "==> restarting $APP"
if pm2 describe "$APP" > /dev/null 2>&1; then
  pm2 restart "$APP" --update-env
else
  pm2 start "node --env-file=.env server/index.mjs" --name "$APP" --cwd "$(pwd)"
  pm2 save
fi

echo "==> checking the server"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/api/me" > /dev/null 2>&1; then
    echo "    up on port $PORT"
    exit 0
  fi
  sleep 1
done
echo "    the server did not answer on port $PORT; see: pm2 logs $APP" >&2
exit 1
