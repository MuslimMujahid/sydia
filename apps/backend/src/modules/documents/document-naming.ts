import type { FileKind } from '../../database/entities';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || name.indexOf('.') !== dot) return '';

  return name.slice(dot);
}

function basenameOf(name: string): string {
  const extension = extensionOf(name);

  return extension ? name.slice(0, -extension.length) : name;
}

export function isUndescriptiveName(originalName: string): boolean {
  const basename = basenameOf(originalName);
  if (basename.length < 4) return true;
  if (/^[0-9]+$/.test(basename)) return true;
  if (!/[A-Za-z]/.test(basename)) return true;

  const hasDigit = /[0-9]/.test(basename);
  const hasIdSymbol = /[-_+=]/.test(basename);
  const mixedId = /[A-Za-z]/.test(basename) && hasDigit;
  if (
    !basename.includes(' ') &&
    hasDigit &&
    hasIdSymbol &&
    basename.length >= 12 &&
    mixedId
  )
    return true;

  if (
    /^[A-Za-z0-9_+\-/=]{16,}$/.test(basename) &&
    (/[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]/.test(basename) ||
      (/-/.test(basename) && /_/.test(basename)))
  )
    return true;

  if (
    /^(img|image|dsc|pxl|vid|audio|file|document|download|upload|screenshot|photo|scan|whatsapp|telegram|tmp|temp|new|untitled|unnamed)[-_ ]*\d*$/i.test(
      basename,
    )
  )
    return true;

  return /^\d{8,}([-_]\d{2,6})?$/.test(basename);
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

export function buildFallbackTitle(
  kind: FileKind,
  originalName: string,
  at: Date,
  timezone: string,
): string {
  const label =
    kind === 'image' ? 'Gambar' : kind === 'audio' ? 'Audio' : 'Dokumen';

  let date: string;

  try {
    date = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(at);
  } catch {
    date = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(at);
  }

  const title = `${label} ${date}`;
  const extension = extensionOf(originalName);
  const result = `${title}${extension}`;

  return result.length > 120 ? result.slice(0, 120) : result;
}
