/**
 * Connection-level failures and error descriptions that work across realms.
 * Shared by the model and decision gateways.
 */
/**
 * Network failures worth retrying. Extends the AI SDK's own list with DNS
 * lookup failures, which a flaky resolver produces at connection time.
 */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * The error and its causes, newest first. Read by shape rather than with
 * `instanceof Error`: errors raised by Node's fetch belong to another realm
 * under a sandboxed module loader (the Jest VM), where `instanceof` is false
 * and every network failure used to be reported as "UnknownError".
 */
function errorChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = error;

  while (
    current !== null &&
    typeof current === 'object' &&
    chain.length < 5 &&
    !chain.includes(current as Record<string, unknown>)
  ) {
    const link = current as Record<string, unknown>;
    chain.push(link);
    current = link.cause;
  }

  return chain;
}

export function errorLabel(error: unknown): string {
  const name = errorChain(error)[0]?.name;

  return typeof name === 'string' && name ? name : 'UnknownError';
}

/**
 * Names and system codes along the cause chain. Messages are left out: a
 * validation error's message can quote model output or user content.
 */
export function errorCause(error: unknown): string | undefined {
  const chain = errorChain(error);
  if (chain.length < 2 && typeof chain[0]?.code !== 'string') return undefined;

  return chain
    .map((link) => {
      const name = typeof link.name === 'string' ? link.name : 'Error';

      return typeof link.code === 'string' ? `${name}(${link.code})` : name;
    })
    .join(' > ');
}

/** A connection-level failure (DNS, reset, timeout) anywhere in the chain. */
export function retryableNetworkError(error: unknown): boolean {
  return errorChain(error).some(
    (link) =>
      typeof link.code === 'string' && RETRYABLE_NETWORK_CODES.has(link.code),
  );
}
