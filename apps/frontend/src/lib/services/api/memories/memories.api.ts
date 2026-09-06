import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type MemoryStatus = "active" | "archived";
export type MemorySourceType =
  "dashboard" | "chat" | "whatsapp" | "document" | "automatic";

export type MemoryProvenance = {
  type: MemorySourceType;
  label: string | null;
  conversationId: string | null;
  messageId: string | null;
  documentId: string | null;
  documentName: string | null;
};

export type Memory = {
  id: string;
  content: string;
  category: string | null;
  status: MemoryStatus;
  pinned: boolean;
  source: MemoryProvenance;
  supersedesId: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryFilters = {
  status?: MemoryStatus | "all";
  pinned?: boolean;
};

export type CreateMemoryInput = {
  content: string;
  category?: string | null;
};

export type UpdateMemoryInput = Partial<CreateMemoryInput> & {
  status?: MemoryStatus;
  pinned?: boolean;
};

const memoryFiltersSchema = z.object({
  status: z.enum(["active", "archived", "all"]).optional(),
  pinned: z.boolean().optional(),
});

function memoryParams(filters: MemoryFilters) {
  return {
    status: filters.status === "all" ? undefined : filters.status,
    pinned: filters.pinned,
  };
}

const getMemoriesServer = createServerFn({ method: "GET" })
  .validator(memoryFiltersSchema)
  .handler(async ({ data }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Memory[]>>("/memories", {
        params: memoryParams(data),
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar memori tidak dapat dimuat.");
    }
  });

const getMemoryServer = createServerFn({ method: "GET" })
  .validator(z.string().min(1))
  .handler(async ({ data: memoryId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Memory>>(
        `/memories/${encodeURIComponent(memoryId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Memori ini tidak dapat dimuat.");
    }
  });

export async function getMemories(
  filters: MemoryFilters = {}
): Promise<Memory[]> {
  if (typeof window === "undefined")
    return getMemoriesServer({ data: filters });

  try {
    const response = await api.get<ApiResponse<Memory[]>>("/memories", {
      params: memoryParams(filters),
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar memori tidak dapat dimuat.");
  }
}

export async function searchMemories(query: string): Promise<Memory[]> {
  try {
    const response = await api.get<ApiResponse<Memory[]>>("/memories/search", {
      params: { q: query.trim() },
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pencarian memori tidak dapat diselesaikan.");
  }
}

export async function getMemory(memoryId: string): Promise<Memory> {
  if (typeof window === "undefined") return getMemoryServer({ data: memoryId });

  try {
    const response = await api.get<ApiResponse<Memory>>(
      `/memories/${encodeURIComponent(memoryId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Memori ini tidak dapat dimuat.");
  }
}

export async function createMemory(values: CreateMemoryInput): Promise<Memory> {
  try {
    const response = await api.post<ApiResponse<Memory>>("/memories", values);

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Memori tidak dapat disimpan.");
  }
}

export async function updateMemory({
  memoryId,
  values,
}: {
  memoryId: string;
  values: UpdateMemoryInput;
}): Promise<Memory> {
  try {
    const response = await api.patch<ApiResponse<Memory>>(
      `/memories/${encodeURIComponent(memoryId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan memori tidak dapat disimpan.");
  }
}

export async function deleteMemory(memoryId: string): Promise<void> {
  try {
    await api.delete(`/memories/${encodeURIComponent(memoryId)}`);
  } catch (error) {
    throw toApiError(error, "Memori tidak dapat dihapus.");
  }
}
