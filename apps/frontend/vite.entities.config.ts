import { readFile } from "node:fs/promises";
import { mergeConfig, type Plugin } from "vite";
import appConfig from "./vite.config";

// Serve the isolated component fixture before Start's application catch-all.
const entityFixture: Plugin = {
  name: "entity-renderer-fixture",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const fixture = request.url?.split("?")[0];
      if (
        fixture !== "/e2e/notes-move.html" &&
        fixture !== "/e2e/billing.html" &&
        fixture !== "/e2e/onboarding.html" &&
        fixture !== "/e2e/checkout.html" &&
        fixture !== "/e2e/account-menu.html" &&
        fixture !== "/e2e/note-drawer.html" &&
        fixture !== "/e2e/entity-renderer.html" &&
        fixture !== "/e2e/chat-previews.html" &&
        fixture !== "/e2e/dev-toolbar.html" &&
        fixture !== "/e2e/calendar-sync.html" &&
        fixture !== "/e2e/notification-settings.html"
      )
        return next();

      try {
        const source = await readFile(
          new URL(`.${fixture}`, import.meta.url),
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
