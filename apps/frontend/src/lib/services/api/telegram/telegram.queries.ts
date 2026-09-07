import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createTelegramLink,
  getTelegramStatus,
  unlinkTelegram,
} from "./telegram.api";

export const telegramQueryKeys = {
  all: ["telegram"] as const,
  status: () => ["telegram", "status"] as const,
};

export const telegramStatusQueryOptions = (pollWhile?: boolean) =>
  queryOptions({
    queryKey: telegramQueryKeys.status(),
    queryFn: getTelegramStatus,
    staleTime: 15_000,
    refetchInterval: pollWhile ? 3_000 : false,
  });

export function useCreateTelegramLink() {
  return useMutation({ mutationFn: createTelegramLink });
}

export function useUnlinkTelegram() {
  return useMutation({
    mutationFn: unlinkTelegram,
    meta: { invalidateQueries: [telegramQueryKeys.all] },
  });
}
