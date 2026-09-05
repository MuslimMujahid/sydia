import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type RequestLocals = {
  requestId?: string;
};

function requestIdFromHeader(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : undefined;
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId =
      requestIdFromHeader(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

    const startedAt = process.hrtime.bigint();
    const locals = response.locals as RequestLocals;

    locals.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      this.logger.log(
        JSON.stringify({
          event: 'request.completed',
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(3)),
        }),
      );
    });

    next();
  }
}

export { REQUEST_ID_HEADER };
