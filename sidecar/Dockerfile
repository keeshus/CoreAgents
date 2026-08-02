# Stage 1: Build Landlock helper
# alpine:3.21 pinned by digest
FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d AS landlock-builder
RUN apk add --no-cache build-base musl-dev linux-headers
COPY sidecar/cmd/landlock-helper/ /src/
WORKDIR /src
RUN make

# Stage 2: Build sidecar server
# node:24-alpine (current LTS) pinned by digest — node:25 is EOL since 2026-03-31
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS builder
WORKDIR /app

COPY package*.json ./
COPY shared/package*.json ./shared/
COPY sidecar/package*.json ./sidecar/
# npm ci for reproducible builds (exact versions from package-lock.json)
RUN npm ci -w shared -w sidecar && npm cache clean --force

COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src/
COPY sidecar/tsconfig.json ./sidecar/
COPY sidecar/src ./sidecar/src/
RUN cd sidecar && npx tsc

# Stage 3: Runtime
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3
RUN apk add --no-cache git curl jq yq python3 py3-pip make gcc g++ musl-dev zip unzip bash shadow

COPY --from=landlock-builder /src/landlock-helper /usr/local/bin/landlock-helper

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/sidecar/dist ./sidecar/dist
COPY --from=builder /app/sidecar/package*.json ./sidecar/

USER 1001
CMD ["node", "sidecar/dist/index.js", "--ttl-hours=168"]
