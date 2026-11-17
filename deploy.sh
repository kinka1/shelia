#!/usr/bin/env bash
# Build the app on this Mac, sync to the VPS, recreate containers.
# Never writes into the VPS app/ dir (separate clone of kinka1/shelia).
set -euo pipefail
cd "$(dirname "$0")"

HOST=ubuntu@213.35.109.129
DEST=/home/Documents/shelia-test
SSH="ssh -i $HOME/.ssh/ssh-key-2025-09-05.key"

(cd web-app && npm ci && npm run build)

# --delete only on the built dist dir
rsync -az --delete -e "$SSH" web-app/dist/ "$HOST:$DEST/web-app/dist/"
rsync -az -e "$SSH" nginx.conf docker-compose.yml "$HOST:$DEST/"
rsync -az -e "$SSH" web/ "$HOST:$DEST/web/"
rsync -az -e "$SSH" monev-mock/ "$HOST:$DEST/monev-mock/"

# remote login shell is fish, so feed bash via stdin
$SSH "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/Documents/shelia-test
docker compose up -d --force-recreate web monev-mock
docker exec shelia-test-web nginx -t
REMOTE
