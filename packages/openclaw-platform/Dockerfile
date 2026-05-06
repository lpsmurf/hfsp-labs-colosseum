FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
RUN mkdir -p data
EXPOSE 8788
CMD ["node", "dist/server.js"]
