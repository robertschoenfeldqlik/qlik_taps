#!/usr/bin/env bash
###############################################################################
# install-target.sh - Install additional Singer targets at runtime
#
# Installs a Python package into the target virtualenv so it can be used
# with run.sh without rebuilding the Docker image.
#
# Usage:
#   /app/install-target.sh target-postgres
#   /app/install-target.sh target-bigquery==0.12.0
#   /app/install-target.sh target-s3-csv target-redshift
#
# Pre-installed targets (already in the image):
#   - target-csv
#   - target-jsonl
###############################################################################
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: install-target.sh TARGET_PACKAGE [TARGET_PACKAGE ...]" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  install-target.sh target-postgres" >&2
  echo "  install-target.sh target-bigquery==0.12.0" >&2
  echo "  install-target.sh target-s3-csv target-redshift" >&2
  echo "" >&2
  echo "Already installed:" >&2
  /opt/target-venv/bin/pip list 2>/dev/null | grep -i "^target-" || echo "  (none found)"
  exit 1
fi

echo "Installing Singer target(s): $*"
echo "Target virtualenv: /opt/target-venv"

/opt/target-venv/bin/pip install --no-cache-dir "$@"

echo ""
echo "Installed targets:"
/opt/target-venv/bin/pip list 2>/dev/null | grep -i "^target-" || true

echo ""
echo "Installation complete. You can now use these targets with run.sh."
