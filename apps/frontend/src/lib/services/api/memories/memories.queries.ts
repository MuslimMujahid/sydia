import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createMemory,
  deleteMemory,
  getMemories,
  getMemory,
  searchMemories,
  updateMemory,
  type Memory,
  type MemoryFilters,
} from "./memories.api";

export const memoryQueryKeys = {
  all: ["memories"] as const,
  lists: () => ["memories", "list"] as const,
  list: (filters: MemoryFilters) => ["memories", "list", filters] as const,
  searches: () => ["memories", "search"] as const,
  search: (query: string) => ["memories", "search", query] as const,
  details: () => ["memories", "detail"] as const,
  detail: (memoryId: string) => ["memories", "detail", memoryId] as const,
};

export const memoriesQueryOptions = (filters: MemoryFilters = {}) =>
  queryOptions({
    queryKey: memoryQueryKeys.list(filters),
    queryFn: () => getMemories(filters),
    staleTime: 15_000,
  });

export const memorySearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: memoryQueryKeys.search(query),
    queryFn: () => searchMemories(query),
    enabled: Boolean(query.trim()),
    staleTime: 15_000,
  });

export const memoryQueryOptions = (memoryId: string) =>
  queryOptions({
    queryKey: memoryQueryKeys.detail(memoryId),
    queryFn: () => getMemory(memoryId),
    enabled: Boolean(memoryId),
  });

function cacheMemory(queryClient: QueryClient, memory: Memory) {
  queryClient.setQueryData(memoryQueryKeys.detail(memory.id), memory);
}

export function useCreateMemory() {
  return useMutation({
    mutationFn: createMemory,
    meta: { invalidateQueries: [memoryQueryKeys.all] },
  });
}

export function useUpdateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMemory,
    onSuccess: (memory) => cacheMemory(queryClient, memory),
    meta: { invalidateQueries: [memoryQueryKeys.all] },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteMemory,
    onSuccess: (_, memoryId) => {
      queryClient.removeQueries({ queryKey: memoryQueryKeys.detail(memoryId) });
    },
    meta: { invalidateQueries: [memoryQueryKeys.all] },
  });
}

export function useSetMemoryPinned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memoryId, pinned }: { memoryId: string; pinned: boolean }) =>
      updateMemory({ memoryId, values: { pinned } }),
    onSuccess: (memory) => cacheMemory(queryClient, memory),
    meta: { invalidateQueries: [memoryQueryKeys.all] },
  });
}
