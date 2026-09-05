export const ErrorCodes = {
  UNKNOWN: 'UNKNOWN',
  TOO_MANY_REQUEST: 'TOO_MANY_REQUEST',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
