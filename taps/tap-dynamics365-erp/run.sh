#!/usr/bin/env bash
###############################################################################
# run.sh - Singer tap|target pipeline runner
#
# Pipes tap-dynamics365-erp into any Singer target with:
#   - Structured logging to file + stderr
#   - Signal trapping for graceful shutdown
#   - State file management (atomic write)
#   - Exit code propagation from both tap and target
#
# Usage:
#   /app/run.sh \
#     --tap-config  /app/config/config.json \
#     --catalog     /app/config/catalog.json \
#     [--state      /app/state/state.json] \
#     --target      target-csv \
#     --target-config /app/config/target_csv_config.json \
#     [--state-output /app/state/state.json]
###############################################################################
set -euo pipefail

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
LOG_DIR="${SINGER_LOG_DIR:-/app/logs}"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/sync_${TIMESTAMP}.log"

log() {
  local level="$1"; shift
  local msg
  msg="$(date -Iseconds) [${level}] $*"
  echo "$msg" | tee -a "$LOG_FILE" >&2
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }

# ---------------------------------------------------------------------------
# Trap: clean up child processes on SIGTERM/SIGINT
# ---------------------------------------------------------------------------
TAP_PID=""
TARGET_PID=""

cleanup() {
  log_warn "Received shutdown signal, terminating pipeline..."
  [[ -n "$TAP_PID"    ]] && kill "$TAP_PID"    2>/dev/null || true
  [[ -n "$TARGET_PID" ]] && kill "$TARGET_PID"  2>/dev/null || true
  wait 2>/dev/null || true
  log_info "Pipeline terminated."
  exit 130
}
trap cleanup SIGTERM SIGINT

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
TAP_CONFIG=""
CATALOG=""
STATE=""
TARGET=""
TARGET_CONFIG=""
STATE_OUTPUT="/app/state/state.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tap-config)    TAP_CONFIG="$2";    shift 2 ;;
    --catalog)       CATALOG="$2";       shift 2 ;;
    --state)         STATE="$2";         shift 2 ;;
    --target)        TARGET="$2";        shift 2 ;;
    --target-config) TARGET_CONFIG="$2"; shift 2 ;;
    --state-output)  STATE_OUTPUT="$2";  shift 2 ;;
    -h|--help)
      echo "Usage: run.sh --tap-config FILE --target NAME [--catalog FILE] [--state FILE] [--target-config FILE] [--state-output FILE]"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required arguments
# ---------------------------------------------------------------------------
if [[ -z "$TAP_CONFIG" ]]; then
  log_error "--tap-config is required"
  exit 1
fi
if [[ ! -f "$TAP_CONFIG" ]]; then
  log_error "Tap config not found: $TAP_CONFIG"
  exit 1
fi
if [[ -z "$TARGET" ]]; then
  log_error "--target is required (e.g. target-csv, target-jsonl)"
  exit 1
fi

# Resolve the target binary - check target-venv first, then PATH
TARGET_BIN="/opt/target-venv/bin/${TARGET}"
if [[ ! -x "$TARGET_BIN" ]]; then
  TARGET_BIN=$(command -v "$TARGET" 2>/dev/null || true)
  if [[ -z "$TARGET_BIN" ]]; then
    log_error "Target '$TARGET' not found. Install it with: /app/install-target.sh $TARGET"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Build commands
# ---------------------------------------------------------------------------
TAP_CMD=("/opt/tap-venv/bin/tap-dynamics365-erp" "--config" "$TAP_CONFIG")

if [[ -n "$CATALOG" ]]; then
  if [[ ! -f "$CATALOG" ]]; then
    log_error "Catalog not found: $CATALOG"
    exit 1
  fi
  TAP_CMD+=("--catalog" "$CATALOG")
fi

if [[ -n "$STATE" && -f "$STATE" ]]; then
  TAP_CMD+=("--state" "$STATE")
fi

TARGET_CMD=("$TARGET_BIN")
if [[ -n "$TARGET_CONFIG" ]]; then
  if [[ ! -f "$TARGET_CONFIG" ]]; then
    log_error "Target config not found: $TARGET_CONFIG"
    exit 1
  fi
  TARGET_CMD+=("--config" "$TARGET_CONFIG")
fi

# ---------------------------------------------------------------------------
# Run pipeline
# ---------------------------------------------------------------------------
log_info "=========================================="
log_info " Singer Pipeline"
log_info "=========================================="
log_info " Tap:          tap-dynamics365-erp"
log_info " Target:       $TARGET ($TARGET_BIN)"
log_info " Tap config:   $TAP_CONFIG"
log_info " Catalog:      ${CATALOG:-auto-discover}"
log_info " State in:     ${STATE:-none}"
log_info " State out:    $STATE_OUTPUT"
log_info " Log file:     $LOG_FILE"
log_info "=========================================="

START_TIME=$(date +%s)

# Ensure state output directory exists
mkdir -p "$(dirname "$STATE_OUTPUT")"

# Temp file for atomic state write
STATE_TMP="${STATE_OUTPUT}.tmp"

# Run: tap | target, tee stderr of each into the log file
# Use process substitution so we can capture PIPESTATUS
"${TAP_CMD[@]}" 2> >(tee -a "$LOG_FILE" >&2) \
  | "${TARGET_CMD[@]}" 2> >(tee -a "$LOG_FILE" >&2) \
  > "$STATE_TMP"

PIPE_STATUS=("${PIPESTATUS[@]}")
TAP_EXIT="${PIPE_STATUS[0]:-0}"
TARGET_EXIT="${PIPE_STATUS[1]:-0}"

END_TIME=$(date +%s)
DURATION=$(( END_TIME - START_TIME ))

# ---------------------------------------------------------------------------
# State file management: extract final STATE message using jq for safe parsing
# ---------------------------------------------------------------------------
if [[ -f "$STATE_TMP" && -s "$STATE_TMP" ]]; then
  # Use jq to reliably extract the last STATE message from mixed output
  LAST_STATE=""
  if command -v jq &>/dev/null; then
    # Parse each line as JSON, select STATE messages, keep last one
    LAST_STATE=$(while IFS= read -r line; do
      echo "$line" | jq -c 'select(.type == "STATE")' 2>/dev/null
    done < "$STATE_TMP" | tail -1)
  else
    # Fallback if jq not available: use grep (less reliable)
    log_warn "jq not found, falling back to grep-based state extraction"
    LAST_STATE=$(grep '"type"' "$STATE_TMP" 2>/dev/null | grep '"STATE"' | tail -1)
  fi

  if [[ -n "$LAST_STATE" ]]; then
    # Validate the extracted state is valid JSON before saving (atomic write)
    if command -v jq &>/dev/null && echo "$LAST_STATE" | jq . >/dev/null 2>&1; then
      echo "$LAST_STATE" > "${STATE_OUTPUT}.new"
      mv -f "${STATE_OUTPUT}.new" "$STATE_OUTPUT"
      log_info "State saved to $STATE_OUTPUT (validated)"
    else
      # Save without validation if jq unavailable
      echo "$LAST_STATE" > "${STATE_OUTPUT}.new"
      mv -f "${STATE_OUTPUT}.new" "$STATE_OUTPUT"
      log_info "State saved to $STATE_OUTPUT"
    fi
  else
    log_warn "No STATE message found in tap output"
  fi
  rm -f "$STATE_TMP"
else
  rm -f "$STATE_TMP"
  log_warn "No state output captured"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "$TAP_EXIT" -ne 0 ]]; then
  log_error "Tap exited with code $TAP_EXIT (duration: ${DURATION}s)"
  exit "$TAP_EXIT"
elif [[ "$TARGET_EXIT" -ne 0 ]]; then
  log_error "Target exited with code $TARGET_EXIT (duration: ${DURATION}s)"
  exit "$TARGET_EXIT"
else
  log_info "Pipeline complete (duration: ${DURATION}s)"
  exit 0
fi
