FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p data

EXPOSE 3001
CMD ["node", "dist/index.js"]
