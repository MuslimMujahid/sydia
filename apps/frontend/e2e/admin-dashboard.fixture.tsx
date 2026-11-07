import { createRoot } from "react-dom/client";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminShell } from "../src/components/admin/admin-shell";
import { Route as HomeRoute } from "../src/routes/admin.index";
import { createQueryClient } from "../src/lib/query-client";
import type { UserProfile } from "../src/lib/services/api/users/users.queries";
import "../src/styles/globals.css";

const client = createQueryClient();
client.setDefaultOptions({ queries: { retry: false } });
const user = {
  id: "admin",
  name: "Admin Sydia",
  email: "admin@example.test",
} as UserProfile;

const rootRoute = createRootRoute({
  component: () => (
    <AdminShell user={user}>
      <Outlet />
    </AdminShell>
  ),
});

const home = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e2e/admin-dashboard.html",
  component: HomeRoute.options.component,
});

const users = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users",
  component: () => <p>Daftar pengguna terfilter</p>,
  validateSearch: (s: Record<string, unknown>) => ({ attention: s.attention }),
});

const router = createRouter({
  routeTree: rootRoute.addChildren([home, users]),
});

const element = document.getElementById("root");
if (!element) throw new Error("Admin dashboard fixture root missing");
createRoot(element).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
