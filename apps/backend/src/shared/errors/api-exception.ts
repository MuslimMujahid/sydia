import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface ApiExceptionOptions {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  status: HttpStatus;
}

export class ApiException extends HttpException {
  readonly code: ErrorCode;

  constructor(options: ApiExceptionOptions) {
    const { code, message, details = {}, status } = options;
    super(
      {
        error: {
          code,
          message,
          details,
        },
      },
      status,
    );
    this.code = code;
  }
}
