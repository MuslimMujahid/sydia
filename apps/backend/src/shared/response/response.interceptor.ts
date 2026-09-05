import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Readable } from 'node:stream';
import { PaginatedResult, Pagination } from './paginated-result';

interface WrappedResponse<T> {
  data: T;
}

interface WrappedPaginatedResponse<T> extends WrappedResponse<T[]> {
  pagination: Pagination;
}

/**
 * Global interceptor that wraps successful HTTP responses in the standard
 * `{ data }` envelope.
 *
 * - {@link PaginatedResult} becomes `{ data, pagination }`.
 * - Arrays become `{ data: [...] }` (no pagination).
 * - Objects and primitives become `{ data }`.
 * - `null`, `undefined`, streams, buffers, and already-wrapped responses are
 *   returned unchanged.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  /**
   * Transforms the response emitted by the route handler.
   *
   * @param _context - The execution context for the current request.
   * @param next - The next handler in the request pipeline.
   * @returns An observable of the wrapped or unchanged response body.
   */
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value): unknown => {
        if (value === null || value === undefined) {
          return value;
        }

        if (this.isAlreadyWrapped(value)) {
          return value;
        }

        if (
          this.isStream(value) ||
          value instanceof StreamableFile ||
          Buffer.isBuffer(value)
        ) {
          return value;
        }

        if (value instanceof PaginatedResult) {
          const response: WrappedPaginatedResponse<unknown> = {
            data: value.data,
            pagination: value.pagination,
          };

          return response;
        }

        if (Array.isArray(value)) {
          const response: WrappedResponse<unknown[]> = {
            data: value,
          };

          return response;
        }

        const response: WrappedResponse<unknown> = {
          data: value,
        };

        return response;
      }),
    );
  }

  private isAlreadyWrapped(value: unknown): boolean {
    return typeof value === 'object' && value !== null && 'data' in value;
  }

  private isStream(value: unknown): boolean {
    return value instanceof Readable;
  }
}
