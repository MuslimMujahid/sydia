function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || name.indexOf('.') !== dot) return '';

  return name.slice(dot);
}

export function sanitizeDerivedTitle(
  candidate: string,
  originalName: string,
): string | null {
  const extension = extensionOf(originalName);
  const cleaned = candidate
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\.{2,}/g, '')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);

      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const withExtension = cleaned
    .toLocaleLowerCase()
    .endsWith(extension.toLocaleLowerCase())
    ? cleaned
    : `${cleaned}${extension}`;

  if (!withExtension.trim()) return null;
  const truncated =
    withExtension.length > 120
      ? `${withExtension.slice(0, Math.max(0, 120 - extension.length))}${extension}`
      : withExtension;

  return truncated.trim() || null;
}
