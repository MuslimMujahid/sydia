# TanStack Start + NestJS Monorepo

A full-stack boilerplate built with Bun and Turborepo. The repository combines a TanStack Start frontend, a NestJS backend, and shared ESLint and TypeScript configuration packages.

## What's included

- `apps/frontend` — TanStack Start application using Vite, Tailwind CSS 4, shadcn/ui, TanStack Query, and TanStack Form.
- `apps/backend` — NestJS 12 application.
- `packages/eslint-config` — shared ESLint configuration.
- `packages/typescript-config` — shared TypeScript configuration.

## Prerequisites

- [Bun](https://bun.sh/) 1.3 or newer
- [Node.js](https://nodejs.org/) 22.22.1 or newer

## Getting started

Install all workspace dependencies from the repository root:

```sh
bun install
```

## Environment variables

The monorepo uses one shared root `.env` as the single source of truth. Set it up before starting the applications:

```sh
bun run setup-env
```

This is an alias for `node scripts/setup-env.js`. It creates `.env` from `.env.example` when needed, then creates relative symlinks from `apps/frontend/.env` and `apps/backend/.env` to `../../.env`, so the repository stays movable.

If either app already has an environment file, pass `--force` to back it up to `.env.backup-<timestamp>` before replacing it with the symlink:

```sh
bun run setup-env --force
```

Shared variables are prefixed with the app that owns the value (`FRONTEND_*` or `BACKEND_*`). Vite public variables use the `VITE_*` prefix:

| Variable              | Default                 | Consumed by                                       |
| --------------------- | ----------------------- | ------------------------------------------------- |
| `FRONTEND_PORT`       | `3000`                  | Frontend dev server; compose port mapping         |
| `FRONTEND_URL`        | `http://localhost:3000` | Backend CORS and Better Auth trusted origin       |
| `BACKEND_PORT`        | `5000`                  | Backend listen port                               |
| `VITE_API_URL`        | `http://localhost:5000` | Frontend API client                               |
| `BACKEND_DB_HOST`     | `localhost`             | Backend database connection                       |
| `BACKEND_DB_PORT`     | `5432`                  | Backend database connection; compose port mapping |
| `BACKEND_DB_USER`     | `postgres`              | Backend database connection; compose              |
| `BACKEND_DB_PASSWORD` | `postgres`              | Backend database connection; compose              |
| `BACKEND_DB_NAME`     | `app`                   | Backend database connection; compose              |

`FRONTEND_URL` must be an absolute `http` or `https` URL with no path, query, or hash. Set it to the exact public frontend origin in deployed environments.

If `FRONTEND_PORT` changes, update the `--port` flag in `apps/frontend/package.json`'s `dev` script to match.

Environment symlinks require a Unix-like shell. On Windows, enable Developer Mode or use an elevated terminal.

## Development database

`docker/docker-compose.dev.yml` provides a PostgreSQL 17 service for local development. It interpolates the `BACKEND_DB_*` variables from the root `.env`, so pass `--env-file` when running it from the repository root:

```sh
docker compose --env-file .env -f docker/docker-compose.dev.yml up -d
```

Data persists in the `postgres-data` volume. Stop it with the same file arguments: `docker compose --env-file .env -f docker/docker-compose.dev.yml down`.

## Production and staging images

`apps/frontend/Dockerfile` and `apps/backend/Dockerfile` build self-contained production images (Turbo prune + Bun install + Node runtime). The production and staging compose files run both apps and intentionally exclude PostgreSQL: point `BACKEND_DB_*` at an externally managed PostgreSQL instance.

For a provider-neutral staging deployment, copy `.env.example` to an operator-managed `.env.staging`, replace the development values with staging values, and run:

```sh
cp .env.example .env.staging
# Edit .env.staging: use the staging API/frontend URLs and real database/auth values.
docker compose --env-file .env.staging -f docker/docker-compose.staging.yml up -d --build
```

The staging file requires `BACKEND_PORT`, `FRONTEND_PORT`, `FRONTEND_URL`, all five `BACKEND_DB_*` variables, `BACKEND_AUTH_SECRET`, `BACKEND_AUTH_URL`, and `VITE_API_URL`. `FRONTEND_URL` must be the exact public frontend origin (an absolute `http` or `https` URL with no path, query, or hash); it is used for credentialed backend CORS and Better Auth trusted origins. `BACKEND_AUTH_SECRET` must be a unique random secret of at least 32 characters; never commit `.env.staging` or place credentials in compose files. `BACKEND_AUTH_URL` is the public backend origin and `VITE_API_URL` is the public API URL baked into the frontend image, so changing either requires a rebuild. The external database must be reachable from the backend container and have the checked-in Prisma migrations applied before traffic is enabled; apply them from a controlled release environment with `bun --cwd apps/backend run db:migrate:deploy`.

For the local production-image stack, use the development `.env` values and:

```sh
docker compose --env-file .env -f docker/docker-compose.prod.yml up -d --build
```

`VITE_API_URL` is inlined into the frontend bundle at build time, so the compose file passes it as a build argument. The backend reads its configuration (`BACKEND_PORT`, `FRONTEND_PORT`, database settings, and auth settings) from the container environment at runtime.

Run the development servers for both applications:

```sh
bun run dev
```

Open the frontend at [http://localhost:3000](http://localhost:3000). The backend listens on [http://localhost:5000](http://localhost:5000).

## Common commands

Run these commands from the repository root:

```sh
bun run dev
bun run build
bun run lint
bun run check-types
bun run test
```

Each command runs the corresponding Turborepo task across the workspaces that define it.

### Run one workspace

Use Turborepo filters with the actual workspace names, `frontend` and `backend`:

```sh
bunx turbo run dev --filter=frontend
bunx turbo run build --filter=frontend
bunx turbo run lint --filter=frontend
bunx turbo run check-types --filter=frontend

bunx turbo run dev --filter=backend
bunx turbo run build --filter=backend
bunx turbo run lint --filter=backend
bunx turbo run test --filter=backend
```

You can also run an application's package scripts directly:

```sh
bun --cwd apps/frontend run dev
bun --cwd apps/backend run dev
```

## Repository layout

```text
apps/
  frontend/
    src/routes/          # TanStack Router file-based routes
    src/components/      # Shared and shadcn/ui components
    src/lib/              # Query, form, and API services
  backend/
    src/                  # NestJS modules and shared server code
packages/
  eslint-config/
  typescript-config/
```

## Further reading

- [TanStack Start](https://tanstack.com/start/latest)
- [NestJS](https://docs.nestjs.com)
- [Turborepo](https://turborepo.dev/docs)
- [Bun](https://bun.sh/docs)
