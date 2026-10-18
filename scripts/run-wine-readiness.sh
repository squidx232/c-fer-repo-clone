#!/usr/bin/env bash
# Original Windows loader probes under workspace-local Wine 11.
# Does not run a full simulation, patch vendor code, or bypass initialization.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.local-analysis"
WINE="$TOOLS/wine11/root/opt/wine-stable/bin/wine"
DOTNET="$TOOLS/dotnet-windows/dotnet.exe"
for file in "$WINE" "$DOTNET" "$TOOLS/probe-windows/EngineProbe.dll"; do
  if [ ! -f "$file" ]; then printf 'Missing required local tool: %s\n' "$file" >&2; exit 1; fi
done
export LD_LIBRARY_PATH="$TOOLS/wine/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WINEPREFIX="$TOOLS/wine11/prefix"
export WINESERVER="$TOOLS/wine11/root/opt/wine-stable/bin/wineserver"
export WINEDEBUG=-all
export TMPDIR="$TOOLS/tmp"
unset WINEDLLPATH
mkdir -p "$TMPDIR"
WINDOWS_ROOT="Z:${ROOT//\//\\}"
OUTPUT="$TOOLS/wine11-loader-results"
# Do not allow a stale successful report to masquerade as a fresh run.
mkdir -p "$OUTPUT"
rm -f "$OUTPUT/runtime-paths.json"
timeout 120 "$WINE" "$DOTNET" \
  "$WINDOWS_ROOT\\.local-analysis\\probe-windows\\EngineProbe.dll" \
  "$WINDOWS_ROOT\\.local-analysis\\app-files" \
  "$WINDOWS_ROOT\\.local-analysis\\wine11-loader-results" > "$OUTPUT/console.log" 2>&1
python3 - "$OUTPUT/runtime-paths.json" <<'PY'
import json, sys
with open(sys.argv[1]) as stream:
    report = json.load(stream)
blocked = []
for name in ('catalog', 'sampleProject', 'desktop'):
    item = report[name]
    print(name + ': ' + item['status'])
    for error in item.get('errors', []):
        print('  ' + error['type'] + ': ' + error['message'])
    if item['status'] != 'success':
        blocked.append(name)
print('Scope: original loader readiness, NOT complete simulation or UI parity.')
sys.exit(1 if blocked else 0)
PY
