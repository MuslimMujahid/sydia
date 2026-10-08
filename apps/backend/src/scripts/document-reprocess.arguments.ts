export function parseReprocessingArguments(args: string[]) {
  const values = new Map<string, string>();
  const documentIds: string[] = [];
  let execute = false;
  let refreshExtraction = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;

    if (arg === '--execute') {
      execute = true;
      continue;
    }

    if (arg === '--refresh-extraction') {
      refreshExtraction = true;
      continue;
    }

    if (!['--user-id', '--document-id', '--limit', '--after-id'].includes(arg))
      throw new Error('Unsupported document reprocessing argument.');
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new Error('Missing argument value.');

    if (arg === '--document-id') documentIds.push(value);
    else {
      if (values.has(arg)) throw new Error('Duplicate reprocessing argument.');
      values.set(arg, value);
    }
  }

  const userId = values.get('--user-id');
  const limit = Number(values.get('--limit') ?? 5);
  if (
    !userId?.trim() ||
    userId.length > 128 ||
    !documentIds.length ||
    documentIds.length > 1000 ||
    documentIds.some((id) => !id.trim() || id.length > 128)
  )
    throw new Error(
      'Provide --user-id and 1–1000 explicit --document-id selections.',
    );
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new Error('Reprocessing limit must be 1–20.');
  const afterId = values.get('--after-id');
  if (afterId && !documentIds.includes(afterId))
    throw new Error('Resume cursor must belong to the selected IDs.');

  return { userId, documentIds, limit, afterId, execute, refreshExtraction };
}
