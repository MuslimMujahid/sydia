import { resolve, sep } from "node:path";

type StartServer = {
  fetch(request: Request): Response | Promise<Response>;
};
const port = Number(process.env.PORT ?? 3000);

const clientDirectory = resolve(import.meta.dir, "dist/client");
// The generated server entry exists only after Vite builds the application.
const { default: startServer } = (await import("./dist/server/server.js")) as {
  default: StartServer;
};

function resolveClientAsset(pathname: string): string | undefined {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const assetPath = resolve(clientDirectory, `.${decodedPath}`);

  if (
    assetPath === clientDirectory ||
    !assetPath.startsWith(`${clientDirectory}${sep}`)
  ) {
    return undefined;
  }

  return assetPath;
}

const server = Bun.serve({
  hostname: process.env.HOSTNAME ?? "0.0.0.0",
  port,
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    const assetPath = resolveClientAsset(url.pathname);

    if (assetPath && (request.method === "GET" || request.method === "HEAD")) {
      const asset = Bun.file(assetPath);

      if (await asset.exists()) {
        return new Response(asset, {
          headers: {
            "Cache-Control": url.pathname.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          },
        });
      }
    }

    return startServer.fetch(request);
  },
});

console.log(`Server started: http://${server.hostname}:${server.port}`);
