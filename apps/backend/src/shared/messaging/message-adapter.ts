export type MessageProvider = 'whatsapp' | 'telegram';

export type MessageKind = 'text' | 'image' | 'document' | 'voice' | 'unknown';

export type NormalizedInboundMessage = {
  provider: MessageProvider;
  providerMessageId: string;
  senderExternalId: string;
  chatExternalId: string;
  isGroup: boolean;
  isFromMe: boolean;
  receivedAt: Date;
  text: string;
  kind: MessageKind;
  caption?: string;
  mediaMessage?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type OutboundMessage = {
  recipientExternalId: string;
  content: string;
  replyToProviderMessageId?: string;
};

export type OutboundMessageResult = {
  providerMessageId: string;
};

export interface InboundMessageAdapter<TInput> {
  normalize(input: TInput): NormalizedInboundMessage | null;
}

export interface OutboundMessageAdapter {
  send(input: OutboundMessage): Promise<OutboundMessageResult>;
}
