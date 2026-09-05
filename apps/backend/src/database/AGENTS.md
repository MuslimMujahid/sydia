# Database Layer Guidelines

Persistence contracts and application-facing record types live in `apps/backend/src/database`. The current layer contains `entities/`, `interfaces/`, and `repositories/`; keep each concern in its matching directory and follow the existing `index.ts` barrels.

## Structure

- `entities/*.entity.ts` — record shapes returned to feature code. Derive them from generated Prisma model types with `Pick` (or another type-level projection), so schema drift fails at compile time. For example, `entities/user.entity.ts` imports the `User` type from `../../generated/prisma/client` and exposes the selected user fields as `User`.
- `interfaces/*.repository.interface.ts` — repository contracts and injection tokens, such as `IUserRepository` and `USER_REPOSITORY = Symbol('IUserRepository')`.
- `repositories/prisma-*.repository.ts` — data adapters implementing their corresponding interfaces. The current `PrismaUserRepository` receives `PrismaService` from `../../infra/prisma`, selects only the entity fields, and contains no business or HTTP logic.
- Each database subdirectory has an `index.ts` barrel. Consumers should import from `database/entities`, `database/interfaces`, or `database/repositories` rather than bypassing those public surfaces.

## Rules

- Generated Prisma output is at `src/generated/prisma` and is generated code: never edit it directly. Database entities may import generated **types** from `../../generated/prisma/client` to derive their public shape.
- The Prisma runtime client is constructed and owned by `src/infra/prisma/PrismaService`. Repository adapters are the persistence bridge that use that service; feature services and controllers depend only on database entities/interfaces.
- Domain modules bind tokens to adapters in their own `*.module.ts`, for example:

  ```ts
  {
    provide: USER_REPOSITORY,
    useClass: PrismaUserRepository,
  }
  ```

- Outside the database layer, only a domain module's provider binding may import from `database/repositories`. Services inject contracts from `database/interfaces`:

  ```ts
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}
  ```

- Prefer Prisma `select` projections over full rows, and ensure the selected shape satisfies the entity type. Keep persistence adapters free of DTOs, controllers, HTTP status codes, and product decisions.
- Adding persistence for a domain means adding the entity projection, repository interface/token, Prisma adapter, barrel exports, and one provider binding in that domain's module. Do not let Better Auth-owned identity tables be written directly by application repositories unless the feature explicitly owns a separate persistence concern.
