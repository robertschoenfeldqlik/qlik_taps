###############################################################################
# Dockerfile for tap-rest-api (Singer.io)
#
# Multi-stage build with 3 isolated virtualenvs (tap / targets / tools).
# Supports running the tap standalone, piping to a built-in target,
# or installing additional targets at runtime.
#
# Build:
#   docker build -t tap-rest-api .
#
# Quick examples:
#   # Discover streams
#   docker run --rm -v ./config:/app/config \
#     tap-rest-api --config /app/config/config.json --discover
#
#   # Sync to CSV via pipeline helper
#   docker run --rm \
#     -v ./config:/app/config -v ./output:/app/output -v ./state:/app/state \
#     --entrypoint /app/run.sh tap-rest-api \
#       --tap-config /app/config/config.json \
#       --catalog /app/config/catalog.json \
#       --target target-csv \
#       --target-config /app/config/target_csv_config.json
#
#   # Install an additional target at runtime, then sync
#   docker run --rm \
#     -v ./config:/app/config -v ./output:/app/output \
#     --entrypoint bash tap-rest-api -c \
#       "/app/install-target.sh target-postgres && \
#        /app/run.sh --tap-config /app/config/config.json \
#          --catalog /app/config/catalog.json \
#          --target target-postgres \
#          --target-config /app/config/target_pg_config.json"
###############################################################################

# ---------------------------------------------------------------------------
# Stage 1: Builder - compile C extensions, install all Python packages
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential gcc libffi-dev libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# --- Tap virtualenv ---
RUN python -m venv /opt/tap-venv
ENV PATH="/opt/tap-venv/bin:$PATH"

WORKDIR /build/tap

# Copy dependency metadata first (layer cache optimisation)
COPY setup.py ./
COPY tap_rest_api/__init__.py tap_rest_api/__init__.py

# Install deps only (cached unless setup.py changes)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -e .

# Copy full source and do a clean install
COPY tap_rest_api/ tap_rest_api/
RUN pip install --no-cache-dir .

# --- Target virtualenv (common targets pre-installed) ---
RUN python -m venv /opt/target-venv
ENV PATH="/opt/target-venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
        target-csv \
        target-jsonl

# --- Singer tools virtualenv (validation & debugging) ---
RUN python -m venv /opt/tools-venv
ENV PATH="/opt/tools-venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir singer-tools

# ---------------------------------------------------------------------------
# Stage 2: Runtime - slim image with only what we need
# ---------------------------------------------------------------------------
FROM python:3.11-slim

LABEL maintainer="Singer Community" \
      description="Singer.io tap for any REST API with auto schema inference, denesting, and flexible auth" \
      org.opencontainers.image.title="tap-rest-api"

# Runtime deps only (no compiler toolchain)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tini \
        curl \
        jq \
        bash && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r singer && useradd -r -g singer -m -s /bin/bash singer

# Copy virtualenvs from builder
COPY --from=builder /opt/tap-venv    /opt/tap-venv
COPY --from=builder /opt/target-venv /opt/target-venv
COPY --from=builder /opt/tools-venv  /opt/tools-venv

# All three virtualenvs on PATH; tap takes priority
ENV PATH="/opt/tap-venv/bin:/opt/target-venv/bin:/opt/tools-venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    SINGER_LOG_DIR="/app/logs"

WORKDIR /app

# Copy helper scripts
COPY run.sh            /app/run.sh
COPY install-target.sh /app/install-target.sh
COPY healthcheck.sh    /app/healthcheck.sh
RUN chmod +x /app/*.sh

# Create standard directories
RUN mkdir -p /app/config /app/output /app/state /app/logs && \
    chown -R singer:singer /app

# Volumes for persisting data across runs
VOLUME ["/app/config", "/app/output", "/app/state", "/app/logs"]

# Healthcheck: verify the tap binary is functional
HEALTHCHECK --interval=60s --timeout=10s --start-period=5s --retries=3 \
    CMD ["/app/healthcheck.sh"]

USER singer

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--", "tap-rest-api"]
CMD ["--help"]
