#!/usr/bin/env bash
###############################################################################
# schedule.sh - Run the Singer pipeline on a schedule
#
# Simple loop-based scheduler (no cron daemon needed). Runs the pipeline
# at a configurable interval, ideal for long-running Docker containers.
#
# Features:
#   - Lock file to prevent concurrent sync runs
#   - Log rotation (keeps last N log files)
#   - Consecutive failure tracking
#
# Environment variables:
#   SYNC_INTERVAL_SECONDS  - Seconds between sync runs (default: 3600 = 1 hour)
#   TAP_CONFIG             - Path to tap config.json
#   CATALOG                - Path to catalog.json
#   STATE                  - Path to state.json (read + written)
#   TARGET                 - Target name (e.g. target-csv)
#   TARGET_CONFIG          - Path to target config.json
#   MAX_LOG_FILES          - Number of log files to keep (default: 50)
#
# Usage:
#   docker run -d \
#     -e SYNC_INTERVAL_SECONDS=3600 \
#     -e TAP_CONFIG=/app/config/config.json \
#     -e CATALOG=/app/config/catalog.json \
#     -e STATE=/app/state/state.json \
#     -e TARGET=target-csv \
#     -e TARGET_CONFIG=/app/config/target_csv_config.json \
#     -v ./config:/app/config -v ./output:/app/output -v ./state:/app/state \
#     --entrypoint /app/schedule.sh tap-dynamics365-erp
###############################################################################
set -euo pipefail

INTERVAL="${SYNC_INTERVAL_SECONDS:-3600}"
TAP_CONFIG="${TAP_CONFIG:-/app/config/config.json}"
CATALOG="${CATALOG:-/app/config/catalog.json}"
STATE="${STATE:-/app/state/state.json}"
TARGET="${TARGET:-target-csv}"
TARGET_CONFIG="${TARGET_CONFIG:-/app/config/target_csv_config.json}"
MAX_LOG_FILES="${MAX_LOG_FILES:-50}"

# Lock file to prevent concurrent syncs
LOCK_FILE="/app/state/.sync.lock"
LOG_DIR="${SINGER_LOG_DIR:-/app/logs}"

echo "=========================================="
echo " Singer Scheduled Pipeline"
echo "=========================================="
echo " Interval:  ${INTERVAL}s"
echo " Tap:       tap-dynamics365-erp"
echo " Target:    $TARGET"
echo " Max logs:  $MAX_LOG_FILES"
echo "=========================================="

# Clean up lock file on exit
cleanup_lock() {
  rm -f "$LOCK_FILE"
}
trap cleanup_lock EXIT

# Rotate old log files — keep only the most recent $MAX_LOG_FILES
rotate_logs() {
  if [[ -d "$LOG_DIR" ]]; then
    local log_count
    log_count=$(find "$LOG_DIR" -maxdepth 1 -name "sync_*.log" -type f 2>/dev/null | wc -l)
    if (( log_count > MAX_LOG_FILES )); then
      local to_delete=$(( log_count - MAX_LOG_FILES ))
      find "$LOG_DIR" -maxdepth 1 -name "sync_*.log" -type f -print0 2>/dev/null \
        | sort -z \
        | head -z -n "$to_delete" \
        | xargs -0 rm -f 2>/dev/null || true
      echo "[$(date -Iseconds)] Rotated logs: removed $to_delete old log file(s)"
    fi
  fi
}

RUN_COUNT=0
CONSECUTIVE_FAILURES=0

while true; do
  RUN_COUNT=$((RUN_COUNT + 1))
  echo ""
  echo "[$(date -Iseconds)] Starting sync run #${RUN_COUNT}..."

  # Check for lock file — prevent concurrent sync runs
  if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
      echo "[$(date -Iseconds)] Sync run #${RUN_COUNT} skipped — previous run (PID $LOCK_PID) still active." >&2
      echo "[$(date -Iseconds)] Next sync in ${INTERVAL} seconds..."
      sleep "$INTERVAL"
      continue
    else
      echo "[$(date -Iseconds)] Removing stale lock file (PID $LOCK_PID no longer running)"
      rm -f "$LOCK_FILE"
    fi
  fi

  # Acquire lock
  echo $$ > "$LOCK_FILE"

  # Rotate logs before each run
  rotate_logs

  # Build run.sh arguments
  ARGS=(
    --tap-config "$TAP_CONFIG"
    --target "$TARGET"
  )
  [[ -f "$CATALOG" ]]      && ARGS+=(--catalog "$CATALOG")
  [[ -f "$STATE" ]]        && ARGS+=(--state "$STATE")
  [[ -f "$TARGET_CONFIG" ]] && ARGS+=(--target-config "$TARGET_CONFIG")
  ARGS+=(--state-output "$STATE")

  # Run the pipeline (don't exit the scheduler on failure)
  if /app/run.sh "${ARGS[@]}"; then
    echo "[$(date -Iseconds)] Sync run #${RUN_COUNT} completed successfully."
    CONSECUTIVE_FAILURES=0
  else
    EXIT_CODE=$?
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo "[$(date -Iseconds)] Sync run #${RUN_COUNT} failed with exit code ${EXIT_CODE} (consecutive failures: ${CONSECUTIVE_FAILURES})." >&2
  fi

  # Release lock
  rm -f "$LOCK_FILE"

  echo "[$(date -Iseconds)] Next sync in ${INTERVAL} seconds..."
  sleep "$INTERVAL"
done
