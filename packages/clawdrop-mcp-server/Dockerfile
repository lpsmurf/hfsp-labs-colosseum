FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Create minimal runtime node_modules with only externalized packages and their deps
COPY scripts/prune-runtime-deps.js ./prune-runtime-deps.js
RUN node prune-runtime-deps.js

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/dist/server.cjs ./server.cjs
COPY --from=builder /app/runtime_node_modules ./node_modules
EXPOSE 3002 3003
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3003/health || exit 1
CMD ["node", "server.cjs"]
