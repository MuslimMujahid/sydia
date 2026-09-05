import { MutationCache, QueryClient, type QueryKey } from "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register { mutationMeta: { invalidateQueries: QueryKey[] } }
}

export function createQueryClient() {
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSettled: (_, __, ___, ____, context) => {
        for (const queryKey of context.meta?.invalidateQueries ?? []) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
    }),
  });
  return queryClient;
}
