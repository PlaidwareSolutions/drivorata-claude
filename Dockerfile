# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (dev deps are needed for the build) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: client (Vite) + server (esbuild) ----
FROM deps AS build
# Build-time client config. Railway passes service variables as build args
# when they are declared with ARG.
ARG VITE_PLATFORM_DOMAIN
ENV VITE_PLATFORM_DOMAIN=${VITE_PLATFORM_DOMAIN}
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: production deps + build output only ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/docs ./docs
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 5000
# Railway sets PORT; the app listens on it (default 5000).
CMD ["node", "dist/index.cjs"]
