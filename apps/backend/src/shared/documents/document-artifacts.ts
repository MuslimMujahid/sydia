/** Private, versioned extraction artifact associated with original file bytes. */
export function extractionKey(storageKey: string): string {
  return `${storageKey}.extraction-v1.json`;
}
