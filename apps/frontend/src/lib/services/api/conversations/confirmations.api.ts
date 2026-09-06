import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type { ToolInvocation } from "./conversations.api";

export async function resolveToolConfirmation({
  invocationId,
  approved,
}: {
  invocationId: string;
  approved: boolean;
}): Promise<ToolInvocation> {
  try {
    const response = await api.post<ApiResponse<ToolInvocation>>(
      `/conversations/tool-invocations/${encodeURIComponent(invocationId)}/confirmation`,
      { approved }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pilihan konfirmasi tidak dapat disimpan.");
  }
}
