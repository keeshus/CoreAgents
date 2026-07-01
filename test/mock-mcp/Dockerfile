FROM node:25-alpine
WORKDIR /app
COPY package.json server.ts ./
RUN npm install tsx
EXPOSE 3003
CMD ["npx", "tsx", "server.ts"]
