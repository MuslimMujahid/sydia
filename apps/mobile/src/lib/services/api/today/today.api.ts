import { queryOptions } from "@tanstack/react-query";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type { Reminder } from "../reminders/reminders.api";
import type { Task } from "../tasks/tasks.api";

export type TodayOverview = {
  date: string;
  tasks: Task[];
  reminders: Reminder[];
};

export async function getToday(): Promise<TodayOverview> {
  try {
    const response = await api.get<ApiResponse<TodayOverview>>("/today");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Ringkasan hari ini tidak dapat dimuat.");
  }
}

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
