import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { isUnauthorizedError } from "@/lib/services/api/api";
import {
  authQueryKeys,
  sessionQueryOptions,
} from "@/lib/services/api/auth/auth.queries";
import {
  currentUserQueryOptions,
  userQueryKeys,
} from "@/lib/services/api/users/users.queries";

export const SAFE_DEFAULT_REDIRECT = "/";

export function safeRedirectTarget(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : SAFE_DEFAULT_REDIRECT;
}

export async function requireSession(
  queryClient: QueryClient,
  locationHref: string
) {
  try {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    if (!session)
      throw redirect({
        to: "/sign-in",
        search: { redirect: locationHref, reason: "required" },
      });

    return session;
  } catch (error) {
    if (isUnauthorizedError(error)) {
      queryClient.removeQueries({ queryKey: authQueryKeys.all });
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
      throw redirect({
        to: "/sign-in",
        search: { redirect: locationHref, reason: "expired" },
      });
    }

    throw error;
  }
}

export async function requireCompletedOnboarding(
  queryClient: QueryClient,
  locationHref: string
) {
  await requireSession(queryClient, locationHref);

  try {
    const user = await queryClient.ensureQueryData(currentUserQueryOptions());
    if (!user.onboardingCompleted) throw redirect({ to: "/onboarding" });

    return user;
  } catch (error) {
    if (isUnauthorizedError(error)) {
      queryClient.removeQueries({ queryKey: authQueryKeys.all });
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
      throw redirect({
        to: "/sign-in",
        search: { redirect: locationHref, reason: "expired" },
      });
    }

    throw error;
  }
}

export async function redirectAuthenticatedUser(queryClient: QueryClient) {
  try {
    const session = await queryClient.ensureQueryData(sessionQueryOptions());
    if (!session) return;
    const user = await queryClient.ensureQueryData(currentUserQueryOptions());
    throw redirect({ to: user.onboardingCompleted ? "/" : "/onboarding" });
  } catch (error) {
    if (isUnauthorizedError(error)) return;
    throw error;
  }
}
