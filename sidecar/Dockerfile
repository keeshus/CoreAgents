# Stage 1: Build Landlock helper
FROM alpine:3.21 AS landlock-builder
RUN apk add --no-cache build-base musl-dev linux-headers
COPY sidecar/cmd/landlock-helper/ /src/
WORKDIR /src
RUN make

# Stage 2: Build sidecar server
FROM node:25-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY shared/package*.json ./shared/
COPY sidecar/package*.json ./sidecar/
RUN npm install -w shared -w sidecar && npm cache clean --force

COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/
COPY sidecar/tsconfig.json ./sidecar/
COPY sidecar/src ./sidecar/src/
RUN cd sidecar && npx tsc

# Stage 3: Runtime
FROM node:25-alpine
RUN apk add --no-cache git curl jq yq python3 py3-pip make gcc g++ musl-dev zip unzip bash shadow

COPY --from=landlock-builder /src/landlock-helper /usr/local/bin/landlock-helper

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/sidecar/dist ./sidecar/dist
COPY --from=builder /app/sidecar/package*.json ./sidecar/

USER 1001
CMD ["node", "sidecar/dist/index.js", "--ttl-hours=168"]
