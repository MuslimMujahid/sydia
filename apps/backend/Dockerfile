# syntax=docker/dockerfile:1
# Backend (NestJS) production image. Build context is the repository root:
#   docker build -f apps/backend/Dockerfile .
#
# Bun is used for dependency installs (bun.lock), but the build itself runs
# under Node: nest build emits different (broken) output under the Bun
# runtime — path aliases such as @shared/* are left unrewritten.

FROM oven/bun:1.3 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo prune backend --docker

# Install all dependencies (dev included) for the build, using only the
# pruned workspace manifests so this layer caches well. Hoisted linking
# keeps a single flat node_modules that plain Node resolves natively.
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --linker hoisted

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/backend
# The Prisma client is generated (gitignored); regenerate before compiling.
# The placeholder BACKEND_DB_URL satisfies prisma.config.ts — generate never
# opens a connection.
ENV BACKEND_DB_URL=postgresql://postgres:postgres@localhost:5432/app
RUN node ../../node_modules/.bin/prisma generate
# Invoke the Nest CLI directly: npm refuses to run scripts here because the
# root package.json pins devEngines.packageManager to bun.
RUN node ../../node_modules/.bin/nest build

# Production-only dependencies for the runtime image.
FROM oven/bun:1.3 AS prod-deps
WORKDIR /app
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --linker hoisted --ignore-scripts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/backend
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend/dist ./dist
USER node
CMD ["node", "dist/src/main.js"]
