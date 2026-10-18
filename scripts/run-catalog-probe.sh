#!/usr/bin/env bash
# Original manufacturer loader only, under the existing local Wine toolchain.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.local-analysis"
export LD_LIBRARY_PATH="$TOOLS/wine/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WINEPREFIX="$TOOLS/wine11/prefix"
export WINESERVER="$TOOLS/wine11/root/opt/wine-stable/bin/wineserver"
export WINEDEBUG="${WINEDEBUG:--all}"
export TMPDIR="$TOOLS/tmp"
unset WINEDLLPATH
mkdir -p "$TMPDIR" "$TOOLS/catalog-only"
# Remove stale success before build or launch, including failed tool startup.
rm -f "$TOOLS/catalog-only/catalog-only.json"
bash "$ROOT/scripts/analysis-tools.sh" dotnet build "$ROOT/scripts/engine-probe/EngineProbe.csproj" \
  -p:ProbeWindows=true "-p:BaseIntermediateOutputPath=$TOOLS/probe-windows-obj/" \
  -o "$TOOLS/probe-windows"
WINDOWS_ROOT="Z:${ROOT//\//\\}"
set +e
timeout 60 "$TOOLS/wine11/root/opt/wine-stable/bin/wine" "$TOOLS/dotnet-windows/dotnet.exe" \
  "$WINDOWS_ROOT\\.local-analysis\\probe-windows\\EngineProbe.dll" --catalog-only \
  "$WINDOWS_ROOT\\.local-analysis\\msi-layout\\C-FER Technologies\\PC-Pump" \
  "$WINDOWS_ROOT\\.local-analysis\\catalog-only" > "$TOOLS/catalog-only/console.log" 2>&1
STATUS=$?
set -e
cat "$TOOLS/catalog-only/console.log"
[[ -f "$TOOLS/catalog-only/catalog-only.json" ]] || { echo 'No fresh catalog report produced.' >&2; exit 1; }
exit "$STATUS"
