FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm --filter @shoplab/web install --frozen-lockfile
COPY frontend frontend
RUN pnpm --filter @shoplab/web build
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
