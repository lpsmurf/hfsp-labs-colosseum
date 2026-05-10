FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
# Install curl (health checks) + docker CLI (spawns user agent containers via host socket)
RUN apt-get update  && apt-get install -y curl ca-certificates gnupg --no-install-recommends  && install -m 0755 -d /etc/apt/keyrings  && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg  && chmod a+r /etc/apt/keyrings/docker.gpg  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list  && apt-get update  && apt-get install -y docker-ce-cli --no-install-recommends  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
RUN mkdir -p data
EXPOSE 8788
CMD ["node", "dist/server.js"]
