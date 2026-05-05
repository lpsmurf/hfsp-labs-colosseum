FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production=false

# Copy source
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY index.html ./
COPY public ./public
COPY src ./src

# Build
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install serve to run the SPA
RUN npm install -g serve

# Copy built assets from builder
COPY --from=0 /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
