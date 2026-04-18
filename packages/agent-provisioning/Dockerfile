# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY services ./services
COPY src ./src
COPY data ./data

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install SSH client for provisioning
RUN apk add --no-cache openssh-client

# Create non-root user
RUN addgroup -g 10001 -S clawd && adduser -u 10001 -S clawd -G clawd

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create data and logs directories
RUN mkdir -p /app/data /app/logs && chown -R clawd:clawd /app

USER clawd

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/services/storefront-bot/src/index.js"]
