import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type TaskStatus = "inbox" | "doing" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type TaskDueFilter = "today" | "upcoming" | "overdue" | "none";

export type TaskSource = {
  type: "dashboard" | "chat" | "whatsapp";
  label?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  tags: string[];
  source: TaskSource | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskFilters = {
  due?: TaskDueFilter | "all";
  search?: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  dueAt?: string | null;
  tags?: string[];
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

const taskFiltersSchema = z.object({
  due: z.enum(["today", "upcoming", "overdue", "none", "all"]).optional(),
  search: z.string().optional(),
});

const taskIdSchema = z.string().min(1);

function taskParams(filters: TaskFilters) {
  return {
    due: filters.due === "all" ? undefined : filters.due,
    search: filters.search?.trim() || undefined,
  };
}

const getTasksServer = createServerFn({ method: "GET" })
  .validator(taskFiltersSchema)
  .handler(async ({ data }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Task[]>>("/tasks", {
        params: taskParams(data),
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar tugas tidak dapat dimuat.");
    }
  });

const getTaskServer = createServerFn({ method: "GET" })
  .validator(taskIdSchema)
  .handler(async ({ data: taskId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Task>>(
        `/tasks/${encodeURIComponent(taskId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Tugas ini tidak dapat dimuat.");
    }
  });

export async function getTasks(filters: TaskFilters = {}): Promise<Task[]> {
  if (typeof window === "undefined") return getTasksServer({ data: filters });

  try {
    const response = await api.get<ApiResponse<Task[]>>("/tasks", {
      params: taskParams(filters),
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar tugas tidak dapat dimuat.");
  }
}

export async function getTask(taskId: string): Promise<Task> {
  if (typeof window === "undefined") return getTaskServer({ data: taskId });

  try {
    const response = await api.get<ApiResponse<Task>>(
      `/tasks/${encodeURIComponent(taskId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Tugas ini tidak dapat dimuat.");
  }
}

export async function createTask(values: CreateTaskInput): Promise<Task> {
  try {
    const response = await api.post<ApiResponse<Task>>("/tasks", values);

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Tugas tidak dapat dibuat.");
  }
}

export async function updateTask({
  taskId,
  values,
}: {
  taskId: string;
  values: UpdateTaskInput;
}): Promise<Task> {
  try {
    const response = await api.patch<ApiResponse<Task>>(
      `/tasks/${encodeURIComponent(taskId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan tugas tidak dapat disimpan.");
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  try {
    await api.delete(`/tasks/${encodeURIComponent(taskId)}`);
  } catch (error) {
    throw toApiError(error, "Tugas tidak dapat dihapus.");
  }
}
