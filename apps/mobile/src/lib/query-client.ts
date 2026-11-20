import {
  MutationCache,
  QueryClient,
  focusManager,
  onlineManager,
  type QueryKey,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { invalidateQueries: readonly QueryKey[] };
  }
}

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          // Client errors will not succeed on retry.
          if (status && status >= 400 && status < 500) return false;

          return failureCount < 2;
        },
      },
    },
    mutationCache: new MutationCache({
      onSettled: (_data, _error, _variables, _context, mutation) => {
        for (const queryKey of mutation.meta?.invalidateQueries ?? []) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
    }),
  });

  return queryClient;
}

let lifecycleWired = false;

/**
 * Native apps have no window focus or `online` events: refetch stale queries
 * when the app returns to the foreground, and pause while offline.
 */
export function wireQueryLifecycle() {
  if (lifecycleWired) return;
  lifecycleWired = true;

  AppState.addEventListener("change", (status) => {
    if (Platform.OS !== "web") focusManager.setFocused(status === "active");
  });

  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected !== false);
    });

    return () => subscription.remove();
  });
}
