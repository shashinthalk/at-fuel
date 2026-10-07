#!/bin/sh
# Prepares the shared history volume. nginx runs every script in
# /docker-entrypoint.d/ itself; the collector service calls this one directly.
set -e
DIR="${HISTORY_DIR:-/usr/share/nginx/html/history}"
mkdir -p "$DIR"

# First start: copy the history that was recorded before the volume existed.
if [ ! -f "$DIR/prices.json" ]; then
  echo "Seeding $DIR from the image"
  cp -R /app/seed-history/. "$DIR/"
fi

# National EU averages are not recorded by the container, so always take the image's copy.
cp /app/seed-history/national.json "$DIR/national.json"
