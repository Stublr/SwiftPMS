#!/usr/bin/env bash
set -euo pipefail

# Bundle @swiftpms/shared into functions for Firebase deploy
# Firebase Cloud Build uses npm which doesn't understand workspace:*

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$REPO_ROOT/packages/shared"
FUNCTIONS_DIR="$REPO_ROOT/packages/functions"

echo ">> Building @swiftpms/shared..."
cd "$SHARED_DIR"
pnpm build

echo ">> Packing @swiftpms/shared..."
TARBALL=$(pnpm pack --pack-destination "$FUNCTIONS_DIR" 2>&1 | tail -1)
TARBALL_NAME=$(basename "$TARBALL")

echo ">> Saving original package.json..."
cd "$FUNCTIONS_DIR"
cp package.json package.json.bak

echo ">> Updating functions/package.json for deploy..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Replace file: reference with the actual tarball name
pkg.dependencies['@swiftpms/shared'] = 'file:./$TARBALL_NAME';

// Remove workspace devDependencies (not needed at runtime)
if (pkg.devDependencies) {
  for (const [key, val] of Object.entries(pkg.devDependencies)) {
    if (typeof val === 'string' && val.startsWith('workspace:')) {
      delete pkg.devDependencies[key];
    }
  }
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json for deploy');
"

echo ">> Building functions..."
pnpm build

echo ">> Done! Ready to deploy."
