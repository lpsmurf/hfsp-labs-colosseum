FROM node:22-slim

WORKDIR /app

# Install build dependencies for native modules and curl for healthcheck
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./
COPY tsconfig.json ./
COPY fix-imports.cjs ./

# Install dependencies
RUN npm install

# Copy source and build
COPY src ./src
COPY bin ./bin
RUN npm run build

# Create data directory for persisted state
RUN mkdir -p /app/data

# Environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CLAWDROP_SERVER=api

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Support both SSE and API servers via environment variable
CMD if [ "$CLAWDROP_SERVER" = "sse" ]; then \
      node dist/sse-server.js; \
    else \
      node dist/api-server.js; \
    fi
