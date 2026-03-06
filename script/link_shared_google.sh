#!/bin/bash

# Create symlinks for shared Google config files that don't already exist
# in the destination directory. This preserves files shipped with the
# repository (e.g. code.gs) while linking deployment-specific files
# (e.g. client_secret.json, app_token.yaml) from the shared storage.

set -euo pipefail

src="${STACK_BASE}/shared/google"
dest="${STACK_PATH}/config/google"

if [ ! -d "$src" ]; then
  echo "Source directory does not exist: $src" >&2
  exit 1
fi

if [ ! -d "$dest" ]; then
  echo "Destination directory does not exist: $dest" >&2
  exit 1
fi

for file in "$src"/*; do
  [ -e "$file" ] || continue
  target="$dest/$(basename "$file")"
  if [ ! -e "$target" ]; then
    ln -sf "$file" "$target"
    echo "Linked: $(basename "$file")"
  else
    echo "Skipped (already exists): $(basename "$file")"
  fi
done