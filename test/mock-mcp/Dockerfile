# node:24-alpine (current LTS) pinned by digest — node:25 is EOL since 2026-03-31
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3
WORKDIR /app
COPY package.json server.ts ./
# Pin tsx to the version locked in the root package-lock.json (4.23.1)
RUN npm install tsx@4.23.1
EXPOSE 3003
CMD ["npx", "tsx", "server.ts"]
