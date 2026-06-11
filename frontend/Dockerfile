# ── Core Agents Frontend ─────────────────────────────────────────
FROM node:25-alpine AS builder
WORKDIR /app

# Monorepo root config
COPY package*.json ./

# Frontend deps (needs shared too if types are referenced)
COPY shared/package*.json ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/
COPY frontend/package*.json ./frontend/
RUN npm install -w shared -w frontend && npm cache clean --force

# Frontend source + build
COPY frontend/tsconfig.json ./frontend/
COPY frontend/next.config.js ./frontend/
COPY frontend/postcss.config.mjs ./frontend/
COPY frontend/components.json ./frontend/
COPY frontend/src ./frontend/src/
COPY frontend/pages ./frontend/pages/
COPY frontend/public ./frontend/public/
RUN npm run build -w frontend

# ── Production image ───────────────────────────────────────
FROM node:25-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/next.config.js ./frontend/
COPY --from=builder /app/frontend/package*.json ./frontend/

EXPOSE 3000
CMD ["npm", "start", "-w", "frontend", "--", "-H", "0.0.0.0"]
