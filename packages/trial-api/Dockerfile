FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app

COPY --from=0 /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=0 /app/dist ./dist

RUN mkdir -p data

EXPOSE 8787
CMD ["node", "dist/server.js"]
