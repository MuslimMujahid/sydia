import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type DevNotificationKind =
  "daily-brief" | "weekly-brief" | "daily-weekly-brief" | "follow-up";
export type DevNotificationResult = {
  status:
    "queued" | "skipped_disabled" | "skipped_user_missing" | "nothing_due";
  deliveryCount: number;
  replayed: boolean;
};

export async function sendDevNotification(input: {
  kind: DevNotificationKind;
  requestId: string;
}): Promise<DevNotificationResult> {
  try {
    const response = await api.post<ApiResponse<DevNotificationResult>>(
      `/dev/notifications/${input.kind}`,
      { requestId: input.requestId }
    );

    return response.data.data;
  } catch (error) {
    console.error("Manual notification failed", error);
    throw toApiError(error, "Could not queue the notification. Try again.");
  }
}
