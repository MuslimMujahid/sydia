import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from './api-exception';
import { ErrorCode, ErrorCodes } from './error-codes';

type ResponseLocals = {
  requestId?: string;
};

type RequestErrorContext = {
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { status, code, message, details } =
      this.resolveErrorPayload(exception);

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logError(exception, {
        requestId: (response.locals as ResponseLocals).requestId,
        method: request.method,
        path: request.path,
        statusCode: status,
      });
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

  private logError(exception: unknown, context: RequestErrorContext): void {
    const errorMessage =
      exception instanceof Error ? exception.message : 'Non-error exception';

    const stack = exception instanceof Error ? exception.stack : undefined;
    const serializedContext = JSON.stringify({
      event: 'request.failed',
      ...context,
      error: errorMessage,
    });

    this.logger.error(serializedContext, stack);
  }
}
