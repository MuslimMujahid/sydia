# Project Guidelines

This repository is a Bun/Turborepo monorepo containing a TanStack Start frontend, a NestJS 12 backend, and shared configuration packages. Before changing code, read the `AGENTS.md` that governs the target directory and follow the most specific applicable guide.

## Repository structure

- `apps/frontend` — TanStack Start application using Vite, Tailwind CSS 4, shadcn/ui, TanStack Router/Query/Form, and Axios.
- `apps/backend` — NestJS 12 application with Better Auth and Prisma 7.
- `packages/eslint-config` — shared ESLint configuration.
- `packages/typescript-config` — shared TypeScript configuration.

## Global rules

- **Codebase exploration:** Use the CodeGraph MCP tool (`codegraph_explore`) first for code questions, architecture or flow tracing, and before changing code. Query the relevant symbols or file names; use its source and call-path results to understand impact. Use file search or direct reads only for details CodeGraph does not cover, such as documentation, configuration, or unindexed files. If CodeGraph reports the project is not indexed, stop querying it for that project and use normal repository tools; do not initialize an index yourself.
- **TypeScript:** Keep strict typing enabled. Avoid `any`; use `unknown` and narrow it when a value is not known. Prefer `type` for data and utility definitions and `interface` for object contracts such as component props when an interface is useful.
- **Exports:** Prefer named exports throughout product source. TanStack Start and other framework/config entrypoints may use a default export when the framework requires it (for example, route/config definitions); do not add default exports merely for convenience.
- **Imports:** Follow each app's configured import style and directory barrels. The frontend may use its configured `@/*` alias; the backend uses relative imports. Do not introduce aliases that are not configured in the target app.
- **Consistency:** Reuse existing names, directory structure, error/response contracts, and dependency patterns before introducing a new one.
- **Cross-channel message testing:** Use the development-only `/chats` page to test assistant response formats for Web chat, Telegram, and WhatsApp side by side. Start the frontend and backend in development mode (`bun run dev`; the backend requires `NODE_ENV=development`) and sign in normally. One composer sends the same message through the existing conversation endpoint for all three channels; previews stay local, and each channel has isolated session/entity data. Use **New session / Sesi baru** to reset all three previews and **Raw response / Respons mentah** to inspect the original text. See [Chat preview testing](./docs/CHAT_PREVIEWS.md) for rendering behavior and targeted checks.

## AGENTS.md index

| Domain                     | Guideline file                                                                                 | Focus                                                       |
| :------------------------- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------------------- |
| **Repository root**        | [AGENTS.md](./AGENTS.md)                                                                       | Monorepo structure and global conventions.                  |
| **Frontend root**          | [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md)                                           | TanStack Start, Vite, routing, SSR, and frontend practices. |
| **Frontend components**    | [apps/frontend/src/components/AGENTS.md](./apps/frontend/src/components/AGENTS.md)             | Shared and UI component structure.                          |
| **Frontend forms**         | [apps/frontend/src/components/forms/AGENTS.md](./apps/frontend/src/components/forms/AGENTS.md) | TanStack Form field and validation patterns.                |
| **Frontend API services**  | [apps/frontend/src/lib/services/api/AGENTS.md](./apps/frontend/src/lib/services/api/AGENTS.md) | Axios client and TanStack Query service conventions.        |
| **Backend root**           | [apps/backend/AGENTS.md](./apps/backend/AGENTS.md)                                             | NestJS architecture, conventions, and testing.              |
| **Backend database**       | [apps/backend/src/database/AGENTS.md](./apps/backend/src/database/AGENTS.md)                   | Entities, repository contracts, and persistence adapters.   |
| **Backend infrastructure** | [apps/backend/src/infra/AGENTS.md](./apps/backend/src/infra/AGENTS.md)                         | Prisma, Better Auth, and configuration wiring.              |
| **Backend domain modules** | [apps/backend/src/modules/AGENTS.md](./apps/backend/src/modules/AGENTS.md)                     | Feature modules, services, controllers, and DI.             |
