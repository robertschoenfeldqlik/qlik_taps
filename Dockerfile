###############################################################################
# Dockerfile — Combined Singer Tap Builder (Node.js UI + Python Taps)
#
# Packages the Express/React config builder UI and Python Singer taps
# (tap-rest-api + tap-dynamics365-erp) into a single container so the
# UI can spawn tap processes directly.
#
# Build:
#   docker compose build app
#   — or —
#   docker build -t singer-tap-builder .
#
# Run:
#   docker compose up -d app
#   — or —
#   docker run -d -p 9090:9090 \
#     -v app-data:/app/server/data \
#     -v app-config:/app/config \
#     -v app-output:/app/output \
#     singer-tap-builder
#
# Then open http://localhost:9090
###############################################################################

# ---------------------------------------------------------------------------
# Stage 1: Python builder — compile C extensions, install taps + targets
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS python-builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential gcc libffi-dev libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# --- tap-rest-api virtualenv ---
RUN python -m venv /opt/tap-venv
ENV PATH="/opt/tap-venv/bin:$PATH"

WORKDIR /build/tap

# Copy dependency metadata first (layer cache optimisation)
COPY taps/tap-rest-api-generic/setup.py ./
COPY taps/tap-rest-api-generic/tap_rest_api/__init__.py tap_rest_api/__init__.py

# Install deps only (cached unless setup.py changes)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -e .

# Copy full source and do a clean install
COPY taps/tap-rest-api-generic/tap_rest_api/ tap_rest_api/
RUN pip install --no-cache-dir .

# --- tap-dynamics365-erp virtualenv ---
RUN python -m venv /opt/dynamics-venv
ENV PATH="/opt/dynamics-venv/bin:$PATH"

WORKDIR /build/dynamics

# Copy dependency metadata first (layer cache optimisation)
COPY taps/tap-dynamics365-erp/setup.py ./
COPY taps/tap-dynamics365-erp/tap_dynamics365_erp/__init__.py tap_dynamics365_erp/__init__.py

# Install deps only (cached unless setup.py changes)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -e .

# Copy full source (including schemas/) and do a clean install
COPY taps/tap-dynamics365-erp/tap_dynamics365_erp/ tap_dynamics365_erp/
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
# Stage 2: Node.js dependencies (cached layer)
# ---------------------------------------------------------------------------
FROM node:20.18-slim AS node-deps

WORKDIR /app

# Copy only package.json files for dependency caching
COPY ui/server/package.json ui/server/package-lock.json* server/
COPY ui/client/package.json ui/client/package-lock.json* client/

# Install server dependencies (production only)
RUN cd server && npm install --omit=dev

# Install client dependencies (includes devDeps needed for build)
RUN cd client && npm install

# ---------------------------------------------------------------------------
# Stage 3: Build React client
# ---------------------------------------------------------------------------
FROM node:20.18-slim AS react-build

WORKDIR /app

# Copy client deps from stage 2
COPY --from=node-deps /app/client/node_modules client/node_modules

# Copy client source
COPY ui/client/ client/

# Build production React bundle
RUN cd client && npm run build

# ---------------------------------------------------------------------------
# Stage 4: Combined runtime — Node.js + Python in one container
# ---------------------------------------------------------------------------
FROM node:20.18-slim

LABEL maintainer="Singer Community" \
      description="Singer Tap Builder — REST API tap config UI with integrated Python tap runner" \
      org.opencontainers.image.title="singer-tap-builder"

# Install Python runtime (no compiler), curl for healthcheck, tini for PID 1
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        curl \
        tini \
        jq \
        bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -m -s /bin/bash appuser

WORKDIR /app

# --- Copy Python virtualenvs from builder ---
COPY --from=python-builder /opt/tap-venv      /opt/tap-venv
COPY --from=python-builder /opt/dynamics-venv /opt/dynamics-venv
COPY --from=python-builder /opt/target-venv   /opt/target-venv
COPY --from=python-builder /opt/tools-venv    /opt/tools-venv

# Fix virtualenv Python symlinks: builder used /usr/local/bin/python,
# but node:20-slim has Python at /usr/bin/python3
RUN ln -sf /usr/bin/python3 /opt/tap-venv/bin/python && \
    ln -sf /usr/bin/python3 /opt/tap-venv/bin/python3 && \
    ln -sf /usr/bin/python3 /opt/dynamics-venv/bin/python && \
    ln -sf /usr/bin/python3 /opt/dynamics-venv/bin/python3 && \
    ln -sf /usr/bin/python3 /opt/target-venv/bin/python && \
    ln -sf /usr/bin/python3 /opt/target-venv/bin/python3 && \
    ln -sf /usr/bin/python3 /opt/tools-venv/bin/python && \
    ln -sf /usr/bin/python3 /opt/tools-venv/bin/python3 && \
    sed -i '1s|.*|#!/opt/tap-venv/bin/python|' /opt/tap-venv/bin/tap-rest-api && \
    sed -i '1s|.*|#!/opt/dynamics-venv/bin/python|' /opt/dynamics-venv/bin/tap-dynamics365-erp && \
    sed -i '1s|.*|#!/opt/target-venv/bin/python|' /opt/target-venv/bin/target-csv && \
    sed -i '1s|.*|#!/opt/target-venv/bin/python|' /opt/target-venv/bin/target-jsonl

# --- Copy Node.js server with production deps ---
COPY --from=node-deps /app/server/node_modules server/node_modules
COPY ui/server/ server/

# --- Copy built React client ---
COPY --from=react-build /app/client/dist client/dist

# --- Copy tap helper scripts ---
COPY taps/tap-rest-api-generic/run.sh            /app/run.sh
COPY taps/tap-rest-api-generic/install-target.sh /app/install-target.sh
COPY taps/tap-rest-api-generic/healthcheck.sh    /app/healthcheck.sh
RUN chmod +x /app/*.sh

# All virtualenvs on PATH so Node.js can spawn tap-rest-api and tap-dynamics365-erp
ENV PATH="/opt/tap-venv/bin:/opt/dynamics-venv/bin:/opt/target-venv/bin:/opt/tools-venv/bin:$PATH" \
    NODE_ENV=production \
    PORT=9090 \
    PYTHONUNBUFFERED=1 \
    SINGER_LOG_DIR="/app/logs"

# Create standard directories (state/runs used for temp config files instead of /tmp)
RUN mkdir -p /app/server/data /app/config /app/output /app/state /app/state/runs /app/logs && \
    chown -R appuser:appuser /app

# Volumes for data persistence
VOLUME ["/app/server/data", "/app/config", "/app/output", "/app/state", "/app/logs"]

# Expose the Express server port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:9090/api/health || exit 1

USER appuser

# Use tini as PID 1 for proper signal handling of child processes
ENTRYPOINT ["tini", "--"]
CMD ["node", "server/src/index.js"]
