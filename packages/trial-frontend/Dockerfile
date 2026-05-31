FROM node:20-alpine AS builder

ARG VITE_PLATFORM_WALLET
ARG VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY index.html ./
COPY src ./src

RUN echo "VITE_PLATFORM_WALLET=${VITE_PLATFORM_WALLET}" > .env && \
    echo "VITE_SOLANA_RPC_URL=${VITE_SOLANA_RPC_URL}" >> .env

RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
