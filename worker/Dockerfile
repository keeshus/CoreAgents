# ── Core Agents Worker ───────────────────────────────────────────
FROM node:25-alpine AS builder
WORKDIR /app

# Monorepo root config
COPY package*.json ./

# Shared types (needed by worker)
COPY shared/package*.json ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/

# Worker deps
COPY worker/package*.json ./worker/
RUN npm install -w shared -w worker --omit=dev && npm cache clean --force

# Worker source + build
COPY worker/tsconfig.build.json ./worker/tsconfig.json
COPY worker/src ./worker/src/
RUN cd worker && npx tsc && cd .. && npm prune --omit=dev

# ── Production image ───────────────────────────────────────
FROM node:25-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/worker/dist ./worker/dist
COPY --from=builder /app/worker/package*.json ./worker/

USER node
CMD ["node", "worker/dist/run.js"]
