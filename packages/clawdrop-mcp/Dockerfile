FROM node:22-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./
COPY tsconfig.json ./
COPY fix-imports.js ./

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

EXPOSE 3000

# Run the SSE server
CMD ["node", "dist/sse-server.js"]
