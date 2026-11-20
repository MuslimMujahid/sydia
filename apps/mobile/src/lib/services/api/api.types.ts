export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiListResponse<T> = {
  data: T[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
  };
};

/** Error envelope returned by the Sydia backend (see apps/backend/src/shared/errors). */
export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};
