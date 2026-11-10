import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who a model call is spent for. A message turn and each background job open a
 * scope, so a gateway deep in the call tree can attribute its cost without
 * every caller threading the user and purpose through its signature.
 */
export type ModelUsageScope = {
  kind: 'message' | 'background';
  /** Background queue or sweep, e.g. conversation-summaries. */
  job?: string;
  userId?: string;
  conversationId?: string;
  runId?: string;
};

const storage = new AsyncLocalStorage<ModelUsageScope>();

/**
 * Runs `work` in a scope; fields left out are inherited from the enclosing one.
 * Without an enclosing scope, `kind` is required for anything to be attributed.
 */
export function withModelUsageScope<T>(
  scope: Partial<ModelUsageScope>,
  work: () => T,
): T {
  const parent = storage.getStore();
  const kind = scope.kind ?? parent?.kind;

  if (!kind) return work();

  return storage.run({ ...parent, ...stripUndefined(scope), kind }, work);
}

export function currentModelUsageScope(): ModelUsageScope | undefined {
  return storage.getStore();
}

function stripUndefined(
  scope: Partial<ModelUsageScope>,
): Partial<ModelUsageScope> {
  return Object.fromEntries(
    Object.entries(scope).filter(([, value]) => value !== undefined),
  );
}
