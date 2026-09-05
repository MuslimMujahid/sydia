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

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};
