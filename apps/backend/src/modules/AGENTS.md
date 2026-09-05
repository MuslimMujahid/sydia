# Domain Module Guidelines

Feature modules live under `apps/backend/src/modules/<module>` (the current example is `modules/users`). A feature owns its Nest module, controllers, and use-case services; keep shared cross-cutting behavior in `src/shared` and persistence concerns in `src/database`.

## Structure

A module may contain:

- one `<module>.module.ts`;
- one or more `<module>.controller.ts` files;
- use-case services under `<module>/services/*.service.ts` with an `index.ts` barrel;
- DTOs or guards in `<module>/dto` or `<module>/guards` when the feature needs them, each following the existing barrel pattern.

Follow the current directory and naming conventions before introducing additional layers. Services are use-case-specific (for example, `get-user.service.ts`) and expose the operation needed by the controller; do not create a service whose only purpose is to call another service.

## Conventions and boundaries

- Use Nest decorators and strict types. Use named exports in ordinary product files and relative imports through existing barrels.
- Controllers own HTTP orchestration and route declarations. They may compose use-case services, but should return plain values. The global `ResponseInterceptor` wraps successful values in `{ data }` (or `{ data, pagination }` for a `PaginatedResult`); controllers must not pre-wrap ordinary responses.
- Modules do not import another domain module's internals. Share behavior through explicit module exports, or move genuinely cross-domain concerns to `src/shared` or `src/database`.
- Better Auth registers a global authentication guard, so routes are protected by default. Mark an intentionally public endpoint explicitly with `@AllowAnonymous()`; use `@OptionalAuth()` only when the integration's optional-auth behavior is intended.

## Persistence and dependency injection

- Feature code never imports Prisma, `src/generated/prisma`, or concrete repository adapters from services/controllers. Inject repository contracts and tokens from `src/database/interfaces`:

  ```ts
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}
  ```

- A feature module may import a concrete adapter only for its provider binding:

  ```ts
  {
    provide: USER_REPOSITORY,
    useClass: PrismaUserRepository,
  }
  ```

- Register every `@Injectable()` used by the module's controllers/services in `providers`. Missing providers fail during Nest bootstrap, not at compile time. Export a provider only when another module has a deliberate dependency on it.

## Errors and validation

- For expected API failures, throw `ApiException` from `src/shared/errors` with a valid `ErrorCodes` member, message, details when useful, and an HTTP status. The global `AllExceptionsFilter` serializes the error envelope; do not construct error responses by hand.
- Use Nest's configured `ValidationPipe` and shared pagination types/utilities rather than reimplementing validation or pagination in each controller. Keep route parameters and service inputs typed, and preserve the response/error envelope contracts when adding endpoints.
