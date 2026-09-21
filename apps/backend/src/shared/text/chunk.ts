const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;

/**
 * Splits prose into overlapping windows for embedding. The overlap keeps a
 * sentence that straddles a boundary retrievable from either side. Returns an
 * empty array for content that normalises to nothing.
 */
export function chunkText(content: string): string[] {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!normalized) return [];
  const chunks: string[] = [];
  for (
    let start = 0;
    start < normalized.length;
    start += CHUNK_SIZE - CHUNK_OVERLAP
  )
    chunks.push(normalized.slice(start, start + CHUNK_SIZE));

  return chunks;
}
