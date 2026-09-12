import { Api, InputFile, type Context } from 'grammy';
import type {
  InboundMessageAdapter,
  NormalizedInboundMessage,
  OutboundMessage,
  OutboundFile,
  OutboundMessageAdapter,
  OutboundMessageResult,
} from '../../shared/messaging';

function messageKind(ctx: Context): NormalizedInboundMessage['kind'] {
  if (ctx.msg?.photo) return 'image';
  if (ctx.msg?.voice) return 'voice';
  if (ctx.msg?.document) return 'document';
  if (ctx.msg?.text) return 'text';

  return 'unknown';
}

function mediaMessage(ctx: Context): Record<string, unknown> | undefined {
  const message = ctx.msg;
  if (!message) return undefined;
  const photo = message.photo?.at(-1);
  if (photo)
    return {
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      mimeType: 'image/jpeg',
      fileName: `${photo.file_unique_id}.jpg`,
    };
  if (message.voice)
    return {
      fileId: message.voice.file_id,
      fileUniqueId: message.voice.file_unique_id,
      mimeType: message.voice.mime_type ?? 'audio/ogg',
      fileName: `${message.voice.file_unique_id}.ogg`,
    };
  if (message.document)
    return {
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      mimeType: message.document.mime_type ?? 'application/octet-stream',
      fileName: message.document.file_name ?? message.document.file_unique_id,
    };

  return undefined;
}

export class TelegramInboundAdapter implements InboundMessageAdapter<Context> {
  normalize(ctx: Context): NormalizedInboundMessage | null {
    const message = ctx.msg;
    const sender = ctx.from;
    if (!message || !sender) return null;
    const kind = messageKind(ctx);
    const chatExternalId = String(message.chat.id);

    return {
      provider: 'telegram',
      providerMessageId: `${chatExternalId}:${message.message_id}`,
      senderExternalId: String(sender.id),
      chatExternalId,
      isGroup: message.chat.type !== 'private',
      isFromMe: sender.id === ctx.me.id,
      receivedAt: new Date(message.date * 1000),
      text: message.text ?? message.caption ?? '',
      kind,
      caption: message.caption,
      mediaMessage: mediaMessage(ctx),
      raw: {
        updateId: ctx.update.update_id,
        messageId: message.message_id,
        businessConnectionId: ctx.businessConnectionId,
        messageThreadId: message.message_thread_id,
      },
    };
  }
}

export class TelegramOutboundAdapter implements OutboundMessageAdapter {
  constructor(private readonly api: Api) {}
  async sendTyping(
    chatExternalId: string,
    scope?: { businessConnectionId?: string; messageThreadId?: number },
  ): Promise<true> {
    return this.api.sendChatAction(chatExternalId, 'typing', {
      business_connection_id: scope?.businessConnectionId,
      message_thread_id: scope?.messageThreadId,
    });
  }

  async send(input: OutboundMessage): Promise<OutboundMessageResult> {
    const sent = await this.api.sendMessage(
      input.recipientExternalId,
      input.content,
      undefined,
    );

    return { providerMessageId: `${sent.chat.id}:${sent.message_id}` };
  }

  async sendFile(input: OutboundFile): Promise<OutboundMessageResult> {
    const sent = await this.api.sendDocument(
      input.recipientExternalId,
      new InputFile(input.buffer, input.filename),
      {
        caption: input.caption,
        business_connection_id: input.businessConnectionId,
        message_thread_id: input.messageThreadId,
      },
    );

    return { providerMessageId: `${sent.chat.id}:${sent.message_id}` };
  }
}
