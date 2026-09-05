import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { isUnauthorizedError, api, toApiError } from "../api";
import {
  signInWithEmail,
  signOut,
  signUpWithEmail,
  type AuthResponse,
  type SessionResponse,
} from "./auth.api";
import { currentUserQueryOptions } from "../users/users.queries";

export const authQueryKeys = {
  all: ["auth"] as const,
  session: () => ["auth", "session"] as const,
};

const getSessionServer = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cookie = getRequestHeader("cookie");
    const response = await api.get<SessionResponse | null>(
      "/api/auth/get-session",
      {
        headers: cookie ? { cookie } : undefined,
      }
    );

    return response.data;
  } catch (error) {
    if (isUnauthorizedError(error)) return null;
    throw toApiError(error, "Sesi Anda tidak dapat diverifikasi.");
  }
});

async function getSession(): Promise<SessionResponse | null> {
  if (typeof window === "undefined") return getSessionServer();

  try {
    const response = await api.get<SessionResponse | null>(
      "/api/auth/get-session"
    );

    return response.data;
  } catch (error) {
    if (isUnauthorizedError(error)) return null;
    throw toApiError(error, "Sesi Anda tidak dapat diverifikasi.");
  }
}

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: authQueryKeys.session(),
    queryFn: getSession,
    staleTime: 30_000,
    retry: false,
  });

async function reconcileAuthenticatedQueries(
  queryClient: QueryClient,
  authResponse: AuthResponse
): Promise<void> {
  if (authResponse.session) {
    queryClient.setQueryData<SessionResponse>(authQueryKeys.session(), {
      user: authResponse.user,
      session: authResponse.session,
    });
  } else {
    queryClient.removeQueries({
      queryKey: authQueryKeys.session(),
      exact: true,
    });
    await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
  }

  await queryClient.fetchQuery({ ...currentUserQueryOptions(), staleTime: 0 });
}

export function useSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signUpWithEmail,
    onSuccess: (data) => reconcileAuthenticatedQueries(queryClient, data),
    meta: { invalidateQueries: [authQueryKeys.all] },
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signInWithEmail,
    onSuccess: (data) => reconcileAuthenticatedQueries(queryClient, data),
    meta: { invalidateQueries: [authQueryKeys.all] },
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: signOut,
    meta: { invalidateQueries: [authQueryKeys.all] },
  });
}
