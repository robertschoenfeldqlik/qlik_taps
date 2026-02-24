###############################################################################
# Dockerfile for tap-config-builder (Singer Tap Config UI)
#
# Multi-stage build: install deps → build React client → slim runtime
#
# Build:
#   docker build -t tap-config-builder .
#
# Run:
#   docker run -d -p 3001:3001 -v tap-data:/app/server/data tap-config-builder
#
# Then open http://localhost:3001
###############################################################################

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies (cached layer)
# ---------------------------------------------------------------------------
FROM node:20-slim AS deps

WORKDIR /app

# Copy only package.json files for dependency caching
COPY server/package.json server/package-lock.json* server/
COPY client/package.json client/package-lock.json* client/

# Install server dependencies
RUN cd server && npm install --omit=dev

# Install client dependencies (includes devDeps needed for build)
RUN cd client && npm install

# ---------------------------------------------------------------------------
# Stage 2: Build React client
# ---------------------------------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

# Copy client deps from stage 1
COPY --from=deps /app/client/node_modules client/node_modules

# Copy client source and shared module (client imports from ../../../../shared/)
COPY client/ client/
COPY shared/ shared/

# Build production React bundle
RUN cd client && npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runtime
# ---------------------------------------------------------------------------
FROM node:20-slim

LABEL maintainer="Singer Community" \
      description="Web UI for building and managing Singer tap-rest-api configurations" \
      org.opencontainers.image.title="tap-config-builder"

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -m -s /bin/bash appuser

WORKDIR /app

# Copy server with production deps from stage 1
COPY --from=deps /app/server/node_modules server/node_modules
COPY server/ server/

# Copy shared modules (used by server for config cleaning)
COPY shared/ shared/

# Copy built React client from stage 2
COPY --from=build /app/client/dist client/dist

# Create data directory for SQLite persistence
RUN mkdir -p /app/server/data && \
    chown -R appuser:appuser /app

# Volume for SQLite database persistence
VOLUME ["/app/server/data"]

# Expose the Express server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

USER appuser

# Set production environment
ENV NODE_ENV=production \
    PORT=3001

CMD ["node", "server/src/index.js"]
