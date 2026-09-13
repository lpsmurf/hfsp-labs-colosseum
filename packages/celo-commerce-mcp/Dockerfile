# Container for the Celo Agent Commerce MCP server (stdio by default; set
# MCP_HTTP_PORT to serve Streamable HTTP). Used by Smithery and self-hosting.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# stdio transport speaks over stdin/stdout; HTTP mode listens on MCP_HTTP_PORT.
ENTRYPOINT ["node", "dist/index.js"]
