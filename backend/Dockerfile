# ── Core Agents Backend ──────────────────────────────────────────
FROM node:25-alpine AS builder
WORKDIR /app

# Monorepo root config
COPY package*.json ./
COPY scripts/sync-version.js ./scripts/

# Shared types (needed by backend)
COPY shared/package*.json ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/

# Backend deps
COPY backend/package*.json ./backend/
RUN npm install -w shared -w backend --omit=dev && npm cache clean --force

# Backend source + build
COPY backend/tsconfig.build.json ./backend/tsconfig.json
COPY backend/src ./backend/src/
COPY backend/drizzle ./backend/drizzle/
RUN cd backend && npx tsc && cd .. && npm prune --omit=dev

# ── Production image ───────────────────────────────────────
FROM node:25-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/drizzle ./backend/drizzle
COPY --from=builder /app/backend/package*.json ./backend/

EXPOSE 3001
USER node
CMD ["node", "backend/dist/index.js"]
