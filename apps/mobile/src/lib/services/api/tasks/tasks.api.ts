import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type { Category } from "../categories/categories.api";

export type TaskStatus = "inbox" | "done" | "cancelled";
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
  categories: Category[];
  source: TaskSource | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskFilters = {
  due?: TaskDueFilter | "all";
  search?: string;
  categoryIds?: string[];
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  dueAt?: string | null;
  categoryIds?: string[];
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

function taskParams(filters: TaskFilters) {
  return {
    due: filters.due === "all" ? undefined : filters.due,
    search: filters.search?.trim() || undefined,
    categoryIds: filters.categoryIds?.join(",") || undefined,
  };
}

export async function getTasks(filters: TaskFilters = {}): Promise<Task[]> {
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
