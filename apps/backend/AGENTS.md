# Backend Agent Guidelines

The backend is a NestJS 12 application under `apps/backend`. Read this guide and the most specific nested guide before changing a backend directory. Keep the existing relative-import and barrel-file style; configured path aliases are not part of this app's contract.

## Conventions

- **TypeScript:** Strict mode is required. Avoid `any`; use `unknown` and narrow it. Add explicit types for public parameters, return values, and object contracts when inference would obscure the contract.
- **Exports:** Use named exports in backend product source. Nest framework entrypoints may use the default export required by configuration or tooling; the ESM Jest config (`jest.config.mjs`, `test/jest-e2e.config.mjs`) is one such configuration exception. Do not add default exports to ordinary modules, controllers, services, entities, or adapters.
- **Nest:** Use Nest decorators (`@Module`, `@Controller`, `@Injectable`, `@Inject`, and so on) and register every provider required by a module.
- **Imports:** Use relative imports and existing `index.ts` barrels (for example, `../../database/interfaces`), without inventing aliases or deep paths that bypass a barrel.

## Architecture

`AppModule` composes the global `ConfigModule`, `PrismaModule`, `AuthModule`, and domain modules. Infrastructure lives in `src/infra`, persistence contracts and adapters in `src/database`, feature modules in `src/modules`, and cross-cutting errors, responses, and pagination in `src/shared`.

Dependency direction is explicit: feature modules depend on database contracts/entities and infrastructure exports; database adapters use the `PrismaService` supplied by `infra/prisma`; infrastructure does not depend on domain modules. Controllers and services must not import the generated Prisma client or repository implementations directly. A domain module may import a repository implementation only in its provider binding.

The Better Auth integration registers a global authentication guard. Routes are protected by default; opt out with `@AllowAnonymous()` (or another integration-supported decorator) only when a route is intentionally public. `main.ts` installs the global validation pipe, exception filter, response interceptor, CORS policy, Helmet, and shutdown hooks—preserve those application-wide contracts.

## Responses and errors

Controllers return plain values. `ResponseInterceptor` wraps successful values in `{ data }` (and paginated results in `{ data, pagination }`), so do not pre-wrap ordinary responses. Throw `ApiException` from `src/shared/errors` with an `ErrorCodes` value and HTTP status; `AllExceptionsFilter` serializes the error envelope. Keep validation and pagination behavior in the shared layer rather than reproducing it per feature.

## Testing and configuration

Tests use Jest through the ESM configuration (`jest.config.mjs` and `test/jest-e2e.config.mjs`) with `ts-jest` and Node test environments. Preserve ESM-compatible imports/configuration and the existing `.js` module-name mapping when adding tests. Runtime configuration is provided by the global `ConfigModule`; infrastructure should read it through `ConfigService`, not directly from `process.env`.

## Nested guides

| Domain | Guideline file | Focus |
| :--- | :--- | :--- |
| **Database layer** | [src/database/AGENTS.md](./src/database/AGENTS.md) | Entities, repository contracts, Prisma adapters. |
| **Infrastructure** | [src/infra/AGENTS.md](./src/infra/AGENTS.md) | Prisma, Better Auth, external-system wiring, and config. |
| **Domain modules** | [src/modules/AGENTS.md](./src/modules/AGENTS.md) | Feature structure, use-case services, controllers, and DI bindings. |
