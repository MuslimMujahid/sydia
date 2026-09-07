import type { NormalizedInboundMessage } from '../../shared/messaging';

export function normalizeJid(jid: string): string {
  const trimmed = jid.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
  const server = at >= 0 ? trimmed.slice(at + 1) : 's.whatsapp.net';
  const bareLocal = local.split(':', 1)[0] ?? local;

  return `${bareLocal}@${server}`;
}

type MediaField = string | Record<string, unknown> | undefined;

function asRecord(value: MediaField): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value : undefined;
}

function kindFromPayload(
  payload: Record<string, unknown>,
): NormalizedInboundMessage['kind'] {
  if (payload.image) return 'image';
  if (payload.audio) return 'voice';
  if (payload.document) return 'document';
  if (typeof payload.body === 'string' && payload.body.length > 0)
    return 'text';

  return 'unknown';
}

function textFromPayload(payload: Record<string, unknown>): string {
  const body = payload.body;

  return typeof body === 'string' ? body : '';
}

function mediaFor(
  payload: Record<string, unknown>,
  kind: NormalizedInboundMessage['kind'],
): Record<string, unknown> | undefined {
  const key =
    kind === 'image'
      ? 'image'
      : kind === 'voice'
        ? 'audio'
        : kind === 'document'
          ? 'document'
          : null;

  if (!key) return undefined;
  const media = payload[key] as MediaField;
  const record = asRecord(media);
  if (!record && typeof media !== 'string') return undefined;

  const result: Record<string, unknown> = {};
  if (typeof record?.caption === 'string') result.caption = record.caption;
  if (typeof record?.filename === 'string') result.fileName = record.filename;
  if (typeof record?.mimetype === 'string') result.mimetype = record.mimetype;
  if (typeof record?.path === 'string') result.path = record.path;
  if (typeof record?.url === 'string') result.url = record.url;
  if (typeof media === 'string') result.path = media;

  return result;
}

function timestampFrom(payload: Record<string, unknown>): Date {
  const raw = payload.timestamp;

  if (typeof raw === 'string') {
    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

export function normalizeInboundEvent(
  payload: Record<string, unknown>,
): NormalizedInboundMessage {
  const chatJid = normalizeJid(
    typeof payload.chat_id === 'string' ? payload.chat_id : '',
  );

  const sender = normalizeJid(
    typeof payload.from === 'string' ? payload.from : chatJid,
  );

  const isGroup = chatJid.endsWith('@g.us');
  const kind = kindFromPayload(payload);
  const text = textFromPayload(payload);
  const mediaMessage = mediaFor(payload, kind);

  return {
    provider: 'whatsapp',
    providerMessageId: typeof payload.id === 'string' ? payload.id : '',
    senderExternalId: sender,
    chatExternalId: chatJid,
    isGroup,
    isFromMe: payload.is_from_me === true,
    receivedAt: timestampFrom(payload),
    text,
    kind,
    caption: text || undefined,
    mediaMessage,
    raw: payload,
  };
}

export function groupMessageAddressesBot(
  input: NormalizedInboundMessage,
  botJid: string | undefined,
): boolean {
  if (!input.isGroup) return true;
  if (!botJid) return false;
  const normalizedBot = normalizeJid(botJid);
  const text = input.text.toLowerCase();
  const botNumber = normalizedBot.split('@', 1)[0] ?? normalizedBot;

  return text.includes(`@${botNumber}`) || text.includes(botNumber);
}
