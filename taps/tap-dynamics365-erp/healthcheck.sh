#!/usr/bin/env bash
###############################################################################
# healthcheck.sh - Docker HEALTHCHECK script
#
# Verifies that the tap binary and key dependencies are functional.
# Returns 0 (healthy) or 1 (unhealthy).
###############################################################################
set -euo pipefail

# Check 1: tap binary exists and responds to --help
tap-dynamics365-erp --help > /dev/null 2>&1 || {
  echo "UNHEALTHY: tap-dynamics365-erp binary not responding" >&2
  exit 1
}

# Check 2: target-csv is available (sanity check for target venv)
/opt/target-venv/bin/target-csv --help > /dev/null 2>&1 || {
  echo "UNHEALTHY: target-csv not responding" >&2
  exit 1
}

# Check 3: Python interpreter works
python --version > /dev/null 2>&1 || {
  echo "UNHEALTHY: Python interpreter not available" >&2
  exit 1
}

echo "HEALTHY"
exit 0
