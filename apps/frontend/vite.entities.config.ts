import { readFile } from "node:fs/promises";
import { mergeConfig, type Plugin } from "vite";
import appConfig from "./vite.config";

// Serve the isolated component fixture before Start's application catch-all.
const entityFixture: Plugin = {
  name: "entity-renderer-fixture",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (!request.url?.startsWith("/e2e/entity-renderer.html")) return next();

      try {
        const source = await readFile(
          new URL("./e2e/entity-renderer.html", import.meta.url),
          "utf8"
        );

        const html = await server.transformIndexHtml(request.url, source);
        response.setHeader("Content-Type", "text/html");
        response.end(html);
      } catch (error) {
        server.config.logger.error(
          `Entity fixture could not be served: ${String(error)}`
        );
        next(error);
      }
    });
  },
};

export default mergeConfig(appConfig, { plugins: [entityFixture] });
