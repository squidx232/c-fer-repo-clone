#!/usr/bin/env bash
# Launch the unchanged desktop from authoritative MSI paths on an existing display.
# No registry installation, activation, cryptography replacement, or bypass.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.local-analysis"
APP="$TOOLS/msi-layout/C-FER Technologies/PC-Pump/PcPump.dll"
WINE="$TOOLS/wine11/root/opt/wine-stable/bin/wine"
: "${DISPLAY:?Set DISPLAY to an available, authorized X display}"
for file in "$APP" "$WINE" "$TOOLS/dotnet-windows/dotnet.exe"; do
  [[ -f "$file" ]] || { printf 'Missing local dependency: %s\n' "$file" >&2; exit 1; }
done
export LD_LIBRARY_PATH="$TOOLS/xvfb/root/usr/lib/x86_64-linux-gnu:$TOOLS/wine/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TMPDIR="$TOOLS/tmp"
mkdir -p "$TMPDIR"
export WINEPREFIX="$TOOLS/wine11/prefix"
export WINESERVER="$TOOLS/wine11/root/opt/wine-stable/bin/wineserver"
export WINEDEBUG="${WINEDEBUG:--all}"
unset WINEDLLPATH
WINDOWS_ROOT="Z:${ROOT//\//\\}"
set +e
timeout "${DESKTOP_TIMEOUT:-120}" "$WINE" "$TOOLS/dotnet-windows/dotnet.exe" \
  "$WINDOWS_ROOT\\.local-analysis\\msi-layout\\C-FER Technologies\\PC-Pump\\PcPump.dll" \
  > "$TOOLS/local-desktop.log" 2>&1
STATUS=$?
set -e
printf 'Desktop exit: %s (124 means timed out; a running error dialog is not success).\n' "$STATUS"
LOG_ROOT="$WINEPREFIX/drive_c/users/appuser/PC-PUMP3/Logs"
if [[ -d "$LOG_ROOT" ]]; then
  find "$LOG_ROOT" -maxdepth 1 -type f -name '*.log' -print
fi
printf 'Console log: %s\n' "$TOOLS/local-desktop.log"
exit "$STATUS"
