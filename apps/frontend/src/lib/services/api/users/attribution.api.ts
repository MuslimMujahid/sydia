import { api } from "../api";
import type { ApiResponse } from "../api.types";

export type AttributionInput = {
  visitorId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPath?: string;
};

export type RecordAttributionResult = {
  recorded: boolean;
};

/** Idempotent: the backend keeps the first record and ignores later writes. */
export async function recordAttribution(
  input: AttributionInput
): Promise<RecordAttributionResult> {
  const response = await api.put<ApiResponse<RecordAttributionResult>>(
    "/users/me/attribution",
    input
  );

  return response.data.data;
}
