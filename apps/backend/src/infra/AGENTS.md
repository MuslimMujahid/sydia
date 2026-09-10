# Infrastructure Module Guidelines

Infrastructure modules under `apps/backend/src/infra` wrap external systems and expose configured Nest providers. The current infrastructure includes `infra/prisma` and `infra/auth`; add a sibling directory only for a genuine external-system integration.

## Structure and boundaries

- One Nest module per external system: `<name>/<name>.module.ts`, implementation files, and an `index.ts` barrel. `PrismaModule` and `AuthModule` are the existing examples.
- Infrastructure configures and exposes clients or integration services; it contains no product-domain business logic and does not import feature modules.
- Use relative imports and the directory barrels (`../prisma`, `./auth`) where they exist. Keep ordinary product exports named; framework/config-required defaults belong only in the entrypoint/config files that require them.

## Configuration

- Read runtime settings through the global Nest `ConfigModule`'s `ConfigService`, using `config.getOrThrow<T>('KEY')` for required values and a typed default only when the setting is intentionally optional. Do not read `process.env` directly in infrastructure code.
- `PrismaService` is the single Prisma 7 client. It reads `BACKEND_DB_URL`, creates a `pg` pool with `PrismaPg`, and disconnects through the Prisma adapter during module shutdown. `PrismaModule` is global and exports that service.
- Prisma's generated client is at `src/generated/prisma`; do not edit generated files. The Prisma schema and generated client use the PostgreSQL adapter configured by `PrismaService`.

## Better Auth

- `AuthModule` uses `@thallesp/nestjs-better-auth` and `createAuth` to configure Better Auth with `BACKEND_AUTH_SECRET`, `BACKEND_AUTH_URL`, the trusted frontend origin, and the Prisma adapter. Better Auth owns the user/session/account/verification identity tables.
- The integration mounts handlers at `/api/auth/*` and registers a global auth guard. Routes are authenticated by default; use `@AllowAnonymous()` (or `@OptionalAuth()` where optional identity is intended) explicitly for public/optional routes. Do not duplicate authentication guards in each feature module.
- Preserve the raw-body handling required by Better Auth: `main.ts` creates Nest with `bodyParser: false`, while the Better Auth integration restores parsers for non-auth routes. Do not bypass the integration with ad-hoc auth handlers.
