/**
 * Pagination parameters.
 */
export type PaginationInput = {
  /** Maximum number of items returned per page. */
  limit: number;

  /** Number of items to skip before returning results. */
  offset: number;
};
