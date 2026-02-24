#!/usr/bin/env bash
###############################################################################
# healthcheck.sh - Docker HEALTHCHECK script
#
# Verifies the tap-rest-api binary is installed and functional by running
# the --help command. Returns exit code 0 if healthy, 1 otherwise.
###############################################################################
set -euo pipefail

/opt/tap-venv/bin/tap-rest-api --help > /dev/null 2>&1
