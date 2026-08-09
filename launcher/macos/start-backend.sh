#!/bin/zsh
set -eu

CONFIG="$HOME/Library/Application Support/LocalAutoHarmonize/project-root"
if [[ -n "${LOCAL_AUTO_HARMONIZE_ROOT:-}" ]]; then
  PROJECT_ROOT="$LOCAL_AUTO_HARMONIZE_ROOT"
elif [[ -f "$CONFIG" ]]; then
  PROJECT_ROOT="$(cat "$CONFIG")"
else
  PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi
PYTHON="$PROJECT_ROOT/.venv/bin/python"
LOG_ROOT="$HOME/Library/Logs/LocalAutoHarmonize"

curl -fsS --max-time 1 http://127.0.0.1:8765/v1/health >/dev/null 2>&1 && exit 0
mkdir -p "$LOG_ROOT"
HARMONIZER_REPO="$PROJECT_ROOT/vendor/Harmonizer" \
HARMONIZER_WEIGHTS="$PROJECT_ROOT/models/harmonizer.pth" \
nohup "$PYTHON" -m uvicorn --app-dir "$PROJECT_ROOT/backend" harmonize_server.main:app \
  --host 127.0.0.1 --port 8765 >"$LOG_ROOT/backend.out.log" 2>"$LOG_ROOT/backend.err.log" &
