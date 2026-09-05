# API requests and TanStack Query

Keep API access in `apps/frontend/src/lib/services/api`. The shared `api` client in `api.ts` is the single Axios instance for backend requests; use it rather than calling `axios` directly or using ad-hoc `fetch` calls.

## Layout and naming

- Group request functions by domain under `src/lib/services/api/<domain>/` (for example, `users/users.api.ts`), and keep domain request/response types nearby. The current shared envelope types are `ApiResponse<T>`, `ApiListResponse<T>`, and `ApiErrorResponse` in `api.types.ts`.
- Keep query keys and query options close to domain API functions. Put reusable React Query hooks under `src/lib/hooks/<domain>/` when a domain needs them. Add or extend barrels only when they are already part of that module's public surface.
- Name request functions `getUserById`, `createUser`, or `updateUserProfile`; hooks use `useGetUserById`, `useCreateUser`, or `useUpdateUserProfile`. Name types after the resource and role, such as `UserResponse` and `CreateUserVariables`.
- Prefer client requests. A server-only request should be introduced only when a TanStack Start server boundary genuinely requires it, and must not expose secrets or server-only environment values to browser code.

## Client and environment

`api.ts` reads the public Vite variable `import.meta.env.VITE_API_URL`, sets JSON headers, and enables `withCredentials: true`. Keep that credential behavior for Better Auth's cookie-based session. Browser code must use `VITE_*` variables only; never read `BACKEND_AUTH_SECRET` or other `BACKEND_*` secrets in the client bundle.

```ts
import { api } from "@/lib/services/api/api";
import type { ApiResponse } from "@/lib/services/api/api.types";

type User = { id: string; name: string; email: string };
export type UserResponse = ApiResponse<User>;

export async function getCurrentUser(): Promise<UserResponse> {
  const response = await api.get<UserResponse>("/users/me");
  return response.data;
}
```

The backend owns the `/users/me` endpoint and the `/api/auth/*` Better Auth endpoints. Keep endpoint paths aligned with backend controllers; do not invent a frontend route as an API substitute. Convert unknown failures with `toApiError(error, fallbackMessage)` when a boundary needs a stable user-facing `Error`.

## Query keys and options

Use a query-key factory per resource. Keep keys serializable, stable, and specific enough that mutations can invalidate exactly the affected data.

```ts
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/services/api/api";

type User = { id: string; name: string; email: string };
type UserResponse = { data: User; message?: string };

async function getCurrentUser(): Promise<UserResponse> {
  const response = await api.get<UserResponse>("/users/me");
  return response.data;
}

export const userQueryKeys = {
  all: ["users"] as const,
  current: () => [...userQueryKeys.all, "current"] as const,
};

export const currentUserQueryOptions = () =>
  queryOptions({ queryKey: userQueryKeys.current(), queryFn: getCurrentUser });
```

A route loader can prefetch with the request-scoped `queryClient` from router context, while a component reads the same options with `useQuery(currentUserQueryOptions())`. Do not create a module-level QueryClient: `src/router.tsx` creates one per `getRouter()` call and installs `setupRouterSsrQueryIntegration`, which owns SSR hydration/provider integration.

```tsx
import { useQuery } from "@tanstack/react-query";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";

export function CurrentUserName() {
  const userQuery = useQuery(currentUserQueryOptions());
  if (userQuery.isPending) return <span aria-busy="true">Loading…</span>;
  if (userQuery.isError)
    return <span role="alert">Unable to load your profile.</span>;
  return <span>{userQuery.data.data.name}</span>;
}
```

In the example above, `users.queries.ts` is the domain module containing the preceding request, key factory, and query options. Create that module only when the users domain is introduced; do not add empty placeholder modules.

## Mutations and invalidation

Use `useMutation` for writes. The project's `MutationCache` reads `context.meta.invalidateQueries` after settlement and invalidates each listed key. The metadata key is exactly `invalidateQueries` (not `invalidatesQueries`).

```ts
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/services/api/api";

const userQueryKeys = {
  current: () => ["users", "current"] as const,
};

type UpdateUserVariables = { name: string };
type UserResponse = { data: { id: string; name: string; email: string } };

async function updateCurrentUser(
  values: UpdateUserVariables
): Promise<UserResponse> {
  const response = await api.patch<UserResponse>("/users/me", values);
  return response.data;
}

export function useUpdateCurrentUser() {
  return useMutation({
    mutationFn: updateCurrentUser,
    meta: { invalidateQueries: [userQueryKeys.current()] },
  });
}
```

Handle mutation pending and error states in the owning UI. Use `toApiError` for a consistent message and avoid duplicating invalidation calls in every component. If a mutation changes a list and a detail, list both query keys in `invalidateQueries`.

## Response and error contracts

- Keep the backend's response/error envelope intact. `ApiResponse<T>` has `data` and an optional `message`; `ApiListResponse<T>` has `data` and offset/limit/total pagination; `ApiErrorResponse` has `error.code`, `error.message`, and `error.details`.
- Type Axios response payloads at the call site and return `response.data`, not the entire Axios response, so query consumers receive the documented envelope.
- Do not silently swallow non-2xx responses or cast unknown payloads to `any`. Let Axios reject, then translate at the UI or service boundary with a meaningful fallback.
