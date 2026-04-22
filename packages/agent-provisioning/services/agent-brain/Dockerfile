FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN npm run build

# Run
EXPOSE 3334
CMD ["npm", "start"]
