#!/usr/bin/env bash
# Workspace-local static-analysis tools; never executes the target application.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.local-analysis"
export GHIDRA_INSTALL_DIR="$TOOLS/ghidra_12.1.4_PUBLIC"
export PATH="$TOOLS/7zip:$PATH"
export HOME="$TOOLS/home"
export TMPDIR="$TOOLS/tmp"
export XDG_CACHE_HOME="$TOOLS/home/cache"
export XDG_CONFIG_HOME="$TOOLS/home/config"
export XDG_DATA_HOME="$TOOLS/home/data"
mkdir -p "$HOME" "$TMPDIR" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME"
if [ "$#" -eq 0 ]; then set -- doctor --provider ghidra; fi
case "$1" in
  7z|7zz) shift; exec "$TOOLS/7zip/7zz" "$@" ;;
  unshield)
    shift
    export LD_LIBRARY_PATH="$TOOLS/unshield/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    exec "$TOOLS/unshield/usr/bin/unshield" "$@"
    ;;
  *) exec node "$TOOLS/rea/node_modules/rea-agents/scripts/rea.mjs" "$@" ;;
esac
