/**
 * Pagination metadata for a paginated collection response.
 */
export interface Pagination {
  /** The number of items skipped before this page (0-based). */
  offset: number;

  /** The maximum number of items returned per page. */
  limit: number;

  /** The total number of items available across all pages. */
  total: number;
}

/**
 * Wrapper returned by controllers to indicate a paginated result.
 *
 * The global {@link ResponseInterceptor} detects this shape and serializes it
 * as `{ data, pagination }`.
 *
 * @example
 * ```ts
 * @Get()
 * findAll(): PaginatedResult<Product> {
 *   return new PaginatedResult(
 *     products,
 *     { offset: 0, limit: 10, total: 100 },
 *   );
 * }
 * ```
 */
export class PaginatedResult<T> {
  /**
   * Creates a paginated result.
   *
   * @param data - The page of items to include in the response.
   * @param pagination - Metadata describing the current page.
   */
  constructor(
    readonly data: T[],
    readonly pagination: Pagination,
  ) {}
}
