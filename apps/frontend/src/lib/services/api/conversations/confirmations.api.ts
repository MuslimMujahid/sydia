import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type { ToolInvocation } from "./conversations.api";

function getConfirmationFallback(english: string, indonesian: string): string {
  return typeof document !== "undefined" &&
    document.documentElement.lang === "id"
    ? indonesian
    : english;
}

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
    throw toApiError(
      error,
      getConfirmationFallback(
        "Confirmation choice could not be saved.",
        "Pilihan konfirmasi tidak dapat disimpan."
      )
    );
  }
}
