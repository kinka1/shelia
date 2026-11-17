#!/usr/bin/env bash
# Build the app on this Mac, sync to the VPS, validate nginx.conf, recreate containers.
# Never writes into the VPS app/ dir (separate clone of kinka1/shelia, now unused).
set -euo pipefail
cd "$(dirname "$0")"

HOST=ubuntu@213.35.109.129
DEST=/home/Documents/shelia-test
SSH=(ssh -i "$HOME/.ssh/ssh-key-2025-09-05.key")

(cd web-app && npm ci && npm run build)

# The VPS has no rsync: copy with tar/cat over ssh (remote login shell is fish, so wrap in bash -c).
# dist is unpacked to dist.new and swapped in, so a broken upload never replaces the live build.
COPYFILE_DISABLE=1 tar --no-xattrs -C web-app/dist -czf - . | "${SSH[@]}" "$HOST" \
  "bash -c 'mkdir -p $DEST/web-app && cd $DEST/web-app && rm -rf dist.new && mkdir dist.new && tar -xzf - -C dist.new && rm -rf dist && mv dist.new dist'"
# nginx.conf goes to a .new file; it replaces the live one only after nginx -t passes
"${SSH[@]}" "$HOST" "cat > $DEST/nginx.conf.new" < nginx.conf
"${SSH[@]}" "$HOST" "cat > $DEST/docker-compose.yml" < docker-compose.yml

# remote login shell is fish, so feed bash via stdin
"${SSH[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/Documents/shelia-test
# validate the new file before it replaces the live one
docker run --rm --network proxy-network \
  -v /home/Documents/shelia-test/nginx.conf.new:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.29-alpine nginx -t
mv nginx.conf.new nginx.conf
docker compose up -d --force-recreate --remove-orphans web
REMOTE
