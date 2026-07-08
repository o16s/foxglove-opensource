#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building Foxglove web assets..."
cd "$REPO_ROOT"
yarn web:build:prod

echo "Copying web assets to Go embed directory..."
rm -rf "$SCRIPT_DIR/dist"
cp -r "$REPO_ROOT/web/.webpack" "$SCRIPT_DIR/dist"

echo "Building Go binary..."
cd "$SCRIPT_DIR"
go build -o foxglove-studio .

echo "Done! Binary: $SCRIPT_DIR/foxglove-studio"
echo "Usage: ./foxglove-studio --mcap-path /path/to/recordings"
