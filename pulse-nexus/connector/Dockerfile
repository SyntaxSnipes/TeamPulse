FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc -p connector/tsconfig.json
EXPOSE 2575
CMD ["node", "connector/dist/connector/server.js"]
