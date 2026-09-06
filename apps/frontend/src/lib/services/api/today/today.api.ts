import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type { Reminder } from "../reminders/reminders.api";
import type { Task } from "../tasks/tasks.api";

export type TodayOverview = {
  date: string;
  tasks: Task[];
  reminders: Reminder[];
};

const getTodayServer = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cookie = getRequestHeader("cookie");
    const response = await api.get<ApiResponse<TodayOverview>>("/today", {
      headers: cookie ? { cookie } : undefined,
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Ringkasan hari ini tidak dapat dimuat.");
  }
});

export async function getToday(): Promise<TodayOverview> {
  if (typeof window === "undefined") return getTodayServer();

  try {
    const response = await api.get<ApiResponse<TodayOverview>>("/today");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Ringkasan hari ini tidak dapat dimuat.");
  }
}
