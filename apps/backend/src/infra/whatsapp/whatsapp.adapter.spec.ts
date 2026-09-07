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
    expect(normalizeJid('120363@g.us')).toBe('120363@g.us');
  });

  it('normalizes a text message payload', () => {
    const normalized = normalizeInboundEvent({
      id: 'message-1',
      chat_id: '62812@s.whatsapp.net',
      from: '62812@s.whatsapp.net',
      timestamp: '2026-09-07T12:00:00Z',
      is_from_me: false,
      body: 'hello there',
    });

    expect(normalized.providerMessageId).toBe('message-1');
    expect(normalized.senderExternalId).toBe('62812@s.whatsapp.net');
    expect(normalized.chatExternalId).toBe('62812@s.whatsapp.net');
    expect(normalized.isGroup).toBe(false);
    expect(normalized.kind).toBe('text');
    expect(normalized.text).toBe('hello there');
  });

  it('normalizes a group image with caption and routes bot mentions', () => {
    const normalized = normalizeInboundEvent({
      id: 'message-2',
      chat_id: '120@g.us',
      from: '62812:4@s.whatsapp.net',
      timestamp: '2026-09-07T12:00:00Z',
      is_from_me: false,
      body: '@62899 look',
      image: 'statics/media/1.jpeg',
    });

    expect(normalized.isGroup).toBe(true);
    expect(normalized.senderExternalId).toBe('62812@s.whatsapp.net');
    expect(normalized.chatExternalId).toBe('120@g.us');
    expect(normalized.kind).toBe('image');
    expect(normalized.text).toBe('@62899 look');
    expect(normalized.mediaMessage).toBeDefined();
    expect(groupMessageAddressesBot(normalized, '62899@s.whatsapp.net')).toBe(
      true,
    );
    expect(groupMessageAddressesBot(normalized, '62888@s.whatsapp.net')).toBe(
      false,
    );
  });

  it('maps audio to the voice kind', () => {
    const normalized = normalizeInboundEvent({
      id: 'message-3',
      chat_id: '62812@s.whatsapp.net',
      from: '62812@s.whatsapp.net',
      timestamp: '2026-09-07T12:00:00Z',
      audio: 'statics/media/1.ogg',
    });

    expect(normalized.kind).toBe('voice');
  });
});
