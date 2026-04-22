# [KIMI] Docker image for telegram-bot service
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3335

CMD ["npm", "start"]
