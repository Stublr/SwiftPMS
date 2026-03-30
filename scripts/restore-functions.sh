#!/usr/bin/env bash
set -euo pipefail

# Restore original package.json after Firebase deploy

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/packages/functions"

cd "$FUNCTIONS_DIR"

if [ -f package.json.bak ]; then
  mv package.json.bak package.json
  echo ">> Restored original package.json"
else
  echo ">> No backup found, skipping restore"
fi

# Clean up tarball
rm -f swiftpms-shared-*.tgz

echo ">> Cleanup complete."
