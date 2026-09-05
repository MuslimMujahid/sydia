import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiException } from './api-exception';
import { ErrorCode, ErrorCodes } from './error-codes';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, code, message, details } =
      this.resolveErrorPayload(exception);

    if (status === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logError(exception);
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
      },
    });
  }

  private resolveErrorPayload(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  } {
    if (exception instanceof ApiException) {
      const response = exception.getResponse() as {
        error: {
          code: ErrorCode;
          message: string;
          details: Record<string, unknown>;
        };
      };
      return {
        status: exception.getStatus(),
        code: response.error.code,
        message: response.error.message,
        details: response.error.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message = 'Internal server error';

      if (typeof response === 'string') {
        message = response;
      } else if (response !== null && typeof response === 'object') {
        const responseMessage = (response as Record<string, unknown>).message;
        message =
          typeof responseMessage === 'string'
            ? responseMessage
            : JSON.stringify(responseMessage);
      }

      return {
        status,
        code: this.mapStatusToCode(status),
        message,
        details: {},
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      details: {},
    };
  }

  private mapStatusToCode(status: number): ErrorCode {
    const mapping: Record<number, ErrorCode> = {
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCodes.INTERNAL_SERVER_ERROR,
      [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.TOO_MANY_REQUEST,
    };
    return mapping[status] ?? ErrorCodes.UNKNOWN;
  }

  private logError(exception: unknown, requestId?: string): void {
    if (exception instanceof Error) {
      console.error(
        `[${requestId}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      console.error(`[${requestId}] Unhandled non-error exception:`, exception);
    }
  }
}
