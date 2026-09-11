# Frontend

TanStack Start frontend using Tailwind CSS 4, shadcn/ui, TanStack Query, and TanStack Form.

## Development

Install dependencies from the monorepo root, then set `VITE_API_URL` (the default backend is `http://localhost:5000`):

```sh
bun run dev
```

The development server runs at [http://localhost:3000](http://localhost:3000).

## Scripts

```sh
bun run dev
bun run build
bun run start
bun run lint
bun run check-types
```

Production builds are emitted to `dist`; `start` serves client assets from `dist/client` and forwards application requests to `dist/server/server.js`.
