FROM node:25-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY scheduler/package*.json ./scheduler/
RUN npm install -w shared -w scheduler --omit=dev && npm cache clean --force

COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/
COPY scheduler/tsconfig.json ./scheduler/
COPY scheduler/src ./scheduler/src/
RUN cd scheduler && npx tsc

FROM node:25-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scheduler/dist ./scheduler/dist
COPY --from=builder /app/scheduler/package*.json ./scheduler/
USER node
CMD ["node", "scheduler/dist/index.js"]
