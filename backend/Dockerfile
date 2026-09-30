FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm --filter @shoplab/api install --frozen-lockfile
COPY backend backend
RUN node backend/node_modules/prisma/build/index.js generate --schema backend/prisma/schema.prisma
COPY scripts/container-start.mjs scripts/container-start.mjs
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=4000 UPLOAD_DIR=/app/uploads
EXPOSE 4000
CMD ["node", "scripts/container-start.mjs"]
