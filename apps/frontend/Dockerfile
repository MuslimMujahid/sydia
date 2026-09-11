# syntax=docker/dockerfile:1
FROM oven/bun:1.3 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo prune frontend --docker

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --linker hoisted

FROM oven/bun:1.3 AS build
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .
RUN bun run --filter=frontend build

FROM oven/bun:1.3 AS prod-deps
WORKDIR /app
COPY --from=prune /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --linker hoisted --ignore-scripts

FROM oven/bun:1.3 AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/frontend/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/server/server.js"]
