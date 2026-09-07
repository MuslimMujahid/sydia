import { describe, expect, it } from '@jest/globals';
import {
  groupMessageAddressesBot,
  normalizeInboundEvent,
  normalizeJid,
} from './whatsapp.adapter';

describe('WhatsApp event adapter', () => {
  it('normalizes device JIDs to stable sender IDs', () => {
    expect(normalizeJid('62812:7@s.whatsapp.net')).toBe('62812@s.whatsapp.net');
    expect(normalizeJid('62812')).toBe('62812@s.whatsapp.net');
  });

  it('normalizes text, caption, and media kinds', () => {
    const normalized = normalizeInboundEvent({
      info: {
        id: 'message-1',
        chat: '120@g.us',
        sender: '62812:4@s.whatsapp.net',
        isFromMe: false,
        isGroup: true,
        timestamp: 1_757_232_000,
        pushName: 'A',
      },
      message: {
        imageMessage: { mimetype: 'image/jpeg', caption: '@62899 look' },
      },
    });

    expect(normalized.senderExternalId).toBe('62812@s.whatsapp.net');
    expect(normalized.chatExternalId).toBe('120@g.us');
    expect(normalized.kind).toBe('image');
    expect(normalized.text).toBe('@62899 look');
    expect(groupMessageAddressesBot(normalized, '62899@s.whatsapp.net')).toBe(
      true,
    );
    expect(groupMessageAddressesBot(normalized, '62888@s.whatsapp.net')).toBe(
      false,
    );
  });
});
