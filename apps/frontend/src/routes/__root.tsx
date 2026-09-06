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
        { name: "theme-color", content: "#fbf8f5" },
        { title: "Sydia · Aktivitas pribadi tertata jelas" },
        {
          name: "description",
          content:
            "Pusat kendali yang tenang untuk akun dan konteks pribadi Anda di Sydia.",
        },
      ],
      links: [
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap",
        },
        {
          rel: "icon",
          href: "/favicon.svg",
          type: "image/svg+xml",
          sizes: "any",
        },
        {
          rel: "icon",
          href: "/favicon-16x16.png",
          type: "image/png",
          sizes: "16x16",
        },
        {
          rel: "icon",
          href: "/favicon-32x32.png",
          type: "image/png",
          sizes: "32x32",
        },
        {
          rel: "apple-touch-icon",
          href: "/apple-touch-icon.png",
          sizes: "180x180",
        },
        {
          rel: "mask-icon",
          href: "/safari-pinned-tab.svg",
          color: "#171419",
        },
        { rel: "manifest", href: "/site.webmanifest" },
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
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only fixed top-2 left-2 z-50 rounded-md bg-ink px-[22px] py-3 text-[15px] font-semibold text-canvas focus:not-sr-only"
        >
          Lewati ke konten
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
