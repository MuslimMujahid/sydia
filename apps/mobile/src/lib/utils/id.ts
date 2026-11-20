import { randomUUID } from "expo-crypto";

/** RFC 4122 v4 id for idempotency keys, request keys, and local list ids. */
export function createId(): string {
  return randomUUID();
}
