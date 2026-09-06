import { queryOptions } from "@tanstack/react-query";
import { getToday } from "./today.api";

export const todayQueryKeys = {
  all: ["today"] as const,
  current: () => ["today", "current"] as const,
};

export const todayQueryOptions = () =>
  queryOptions({
    queryKey: todayQueryKeys.current(),
    queryFn: getToday,
    staleTime: 15_000,
  });
