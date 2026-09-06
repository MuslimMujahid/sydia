import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  getTask,
  getTasks,
  updateTask,
  type Task,
  type TaskFilters,
} from "./tasks.api";
import { todayQueryKeys } from "../today/today.queries";
import { conversationQueryKeys } from "../conversations/conversations.queries";

export const taskQueryKeys = {
  all: ["tasks"] as const,
  lists: () => ["tasks", "list"] as const,
  list: (filters: TaskFilters) => ["tasks", "list", filters] as const,
  details: () => ["tasks", "detail"] as const,
  detail: (taskId: string) => ["tasks", "detail", taskId] as const,
};

export const tasksQueryOptions = (filters: TaskFilters = {}) =>
  queryOptions({
    queryKey: taskQueryKeys.list(filters),
    queryFn: () => getTasks(filters),
    staleTime: 15_000,
  });

export const taskQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: taskQueryKeys.detail(taskId),
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
  });

function cacheTask(queryClient: QueryClient, task: Task) {
  queryClient.setQueryData(taskQueryKeys.detail(task.id), task);
}

export function useCreateTask() {
  return useMutation({
    mutationFn: createTask,
    meta: {
      invalidateQueries: [
        taskQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTask,
    onSuccess: (task) => cacheTask(queryClient, task),
    meta: {
      invalidateQueries: [
        taskQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: (_, taskId) => {
      queryClient.removeQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
    meta: {
      invalidateQueries: [
        taskQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: string;
      status: Task["status"];
    }) => updateTask({ taskId, values: { status } }),
    onSuccess: (task) => cacheTask(queryClient, task),
    meta: {
      invalidateQueries: [
        taskQueryKeys.all,
        todayQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}
