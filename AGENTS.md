# Project Guidelines

This repository is a Bun/Turborepo monorepo containing a TanStack Start frontend, a NestJS 12 backend, and shared configuration packages. Before changing code, read the `AGENTS.md` that governs the target directory and follow the most specific applicable guide.

## Repository structure

- `apps/frontend` — TanStack Start application using Vite, Tailwind CSS 4, shadcn/ui, TanStack Router/Query/Form, and Axios.
- `apps/backend` — NestJS 12 application with Better Auth and Prisma 7.
- `packages/eslint-config` — shared ESLint configuration.
- `packages/typescript-config` — shared TypeScript configuration.

## Global rules

- **TypeScript:** Keep strict typing enabled. Avoid `any`; use `unknown` and narrow it when a value is not known. Prefer `type` for data and utility definitions and `interface` for object contracts such as component props when an interface is useful.
- **Exports:** Prefer named exports throughout product source. TanStack Start and other framework/config entrypoints may use a default export when the framework requires it (for example, route/config definitions); do not add default exports merely for convenience.
- **Imports:** Follow each app's configured import style and directory barrels. The frontend may use its configured `@/*` alias; the backend uses relative imports. Do not introduce aliases that are not configured in the target app.
- **Consistency:** Reuse existing names, directory structure, error/response contracts, and dependency patterns before introducing a new one.

## AGENTS.md index

| Domain | Guideline file | Focus |
| :--- | :--- | :--- |
| **Repository root** | [AGENTS.md](./AGENTS.md) | Monorepo structure and global conventions. |
| **Frontend root** | [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md) | TanStack Start, Vite, routing, SSR, and frontend practices. |
| **Frontend components** | [apps/frontend/src/components/AGENTS.md](./apps/frontend/src/components/AGENTS.md) | Shared and UI component structure. |
| **Frontend forms** | [apps/frontend/src/components/forms/AGENTS.md](./apps/frontend/src/components/forms/AGENTS.md) | TanStack Form field and validation patterns. |
| **Frontend API services** | [apps/frontend/src/lib/services/api/AGENTS.md](./apps/frontend/src/lib/services/api/AGENTS.md) | Axios client and TanStack Query service conventions. |
| **Backend root** | [apps/backend/AGENTS.md](./apps/backend/AGENTS.md) | NestJS architecture, conventions, and testing. |
| **Backend database** | [apps/backend/src/database/AGENTS.md](./apps/backend/src/database/AGENTS.md) | Entities, repository contracts, and persistence adapters. |
| **Backend infrastructure** | [apps/backend/src/infra/AGENTS.md](./apps/backend/src/infra/AGENTS.md) | Prisma, Better Auth, and configuration wiring. |
| **Backend domain modules** | [apps/backend/src/modules/AGENTS.md](./apps/backend/src/modules/AGENTS.md) | Feature modules, services, controllers, and DI. |
