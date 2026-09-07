import type { MessageInfo } from '@whatsmeow-node/whatsmeow-node';
import type { NormalizedInboundMessage } from './whatsapp.types';

export function normalizeJid(jid: string): string {
  const trimmed = jid.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
  const server = at >= 0 ? trimmed.slice(at + 1) : 's.whatsapp.net';
  const bareLocal = local.split(':', 1)[0] ?? local;

  return `${bareLocal}@${server}`;
}

function textFromMessage(message: Record<string, unknown>): string {
  const conversation = message.conversation;
  if (typeof conversation === 'string') return conversation;
  const extended = message.extendedTextMessage;

  if (extended && typeof extended === 'object') {
    const text = (extended as Record<string, unknown>).text;
    if (typeof text === 'string') return text;
  }

  for (const key of ['imageMessage', 'documentMessage', 'videoMessage']) {
    const media = message[key];

    if (media && typeof media === 'object') {
      const caption = (media as Record<string, unknown>).caption;
      if (typeof caption === 'string') return caption;
    }
  }

  return '';
}

function messageKind(
  message: Record<string, unknown>,
): NormalizedInboundMessage['kind'] {
  if (typeof message.conversation === 'string' || message.extendedTextMessage)
    return 'text';
  if (message.imageMessage) return 'image';
  if (message.documentMessage) return 'document';
  if (message.audioMessage) return 'voice';

  return 'unknown';
}

function mediaFor(
  message: Record<string, unknown>,
  kind: NormalizedInboundMessage['kind'],
): Record<string, unknown> | undefined {
  const key =
    kind === 'image'
      ? 'imageMessage'
      : kind === 'document'
        ? 'documentMessage'
        : kind === 'voice'
          ? 'audioMessage'
          : null;

  if (!key) return undefined;
  const media = message[key];

  return media && typeof media === 'object'
    ? (media as Record<string, unknown>)
    : undefined;
}

export function normalizeInboundEvent(event: {
  info: MessageInfo;
  message: Record<string, unknown>;
}): NormalizedInboundMessage {
  const { info, message } = event;
  const kind = messageKind(message);
  const text = textFromMessage(message);

  return {
    provider: 'whatsapp',
    providerMessageId: info.id,
    senderExternalId: normalizeJid(info.isGroup ? info.sender : info.chat),
    chatExternalId: normalizeJid(info.chat),
    isGroup: info.isGroup,
    isFromMe: info.isFromMe,
    receivedAt: new Date(
      info.timestamp > 10_000_000_000 ? info.timestamp : info.timestamp * 1000,
    ),
    text,
    kind,
    caption: text || undefined,
    mediaMessage: mediaFor(message, kind),
    info,
    raw: message,
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
