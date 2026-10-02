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

## Install as an app

Sydia can be installed from a supporting browser's **Install app** action. On iPhone and iPad, use the browser's **Share → Add to Home Screen** action. Installation requires HTTPS in production; localhost is supported for testing.

The manifest at `public/site.webmanifest` gives the app a stable identity, launches at `/`, and uses the existing 192px and 512px icons in a standalone window. The root document also supplies the Apple touch icon and app title.

The service worker registers only in production builds. To verify locally, run `bun run build` followed by `bun run start`, then open `http://localhost:3000`.

Only the public offline page is cached. Navigations use the network and show an Indonesian retry screen when the network is unavailable; personal pages and API responses are never stored in the service worker cache. Normal app features require a connection. Bump `CACHE_NAME` in `public/sw.js` when changing `public/offline.html`. Worker updates activate after existing app windows close, avoiding interruptions to open sessions.

When serving the build through another web server, keep `/sw.js` at the origin root with a JavaScript MIME type and serve `/site.webmanifest` as `application/manifest+json`. Revalidate the worker, manifest, and offline page (`Cache-Control: no-cache`), as the bundled production server does.
