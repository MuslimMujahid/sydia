/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppNotFound } from "@/components/app-states";
import "@/styles/globals.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#181a1c" },
        { title: "Sydia · Personal operations, clearly indexed" },
        {
          name: "description",
          content:
            "A calm web control center for your Sydia account and personal context.",
        },
      ],
    }),
    component: RootComponent,
    notFoundComponent: AppNotFound,
  }
);

function RootComponent() {
  return (
    <RootDocument>
      <ReactQueryDevtools initialIsOpen={false} />
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only fixed top-2 left-2 z-50 bg-brand px-4 py-2 text-ink focus:not-sr-only"
        >
          Skip to content
        </a>
        <div id="main-content">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
