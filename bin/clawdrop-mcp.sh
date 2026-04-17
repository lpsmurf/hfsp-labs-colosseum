#!/usr/bin/env sh
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node --experimental-specifier-resolution=node "$DIR/dist/index.js" "$@"
