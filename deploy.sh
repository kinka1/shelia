#!/usr/bin/env bash
# Build the app on this Mac, sync to the VPS, validate nginx.conf, recreate containers.
# Never writes into the VPS app/ dir (separate clone of kinka1/shelia, now unused).
set -euo pipefail
cd "$(dirname "$0")"

HOST=ubuntu@213.35.109.129
DEST=/home/Documents/shelia-test
SSH=(ssh -i "$HOME/.ssh/ssh-key-2025-09-05.key")

(cd web-app && npm ci && npm run build)

# rsync can't create a missing parent dir
"${SSH[@]}" "$HOST" "mkdir -p $DEST/web-app"

# --delete only on the built dist dir
rsync -az --delete -e "${SSH[*]}" web-app/dist/ "$HOST:$DEST/web-app/dist/"
# nginx.conf goes to a .new file; it replaces the live one only after nginx -t passes
rsync -az -e "${SSH[*]}" nginx.conf "$HOST:$DEST/nginx.conf.new"
rsync -az -e "${SSH[*]}" docker-compose.yml "$HOST:$DEST/"
rsync -az -e "${SSH[*]}" monev-mock/ "$HOST:$DEST/monev-mock/"

# remote login shell is fish, so feed bash via stdin
"${SSH[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/Documents/shelia-test
# validate the new file before it replaces the live one; proxy-network lets shelia-test-monev resolve
docker run --rm --network proxy-network \
  -v /home/Documents/shelia-test/nginx.conf.new:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.29-alpine nginx -t
mv nginx.conf.new nginx.conf
docker compose up -d --force-recreate web monev-mock
REMOTE
