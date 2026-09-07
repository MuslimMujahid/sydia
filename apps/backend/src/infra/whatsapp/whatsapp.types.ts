import type {
  ChatPresence,
  MessageInfo,
  SendResponse,
  WhatsmeowClient,
  WhatsmeowEvents,
} from '@whatsmeow-node/whatsmeow-node';

export type WhatsAppGatewayStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'awaiting_pair'
  | 'enforced'
  | 'logged_out';

export type NormalizedInboundMessage = {
  provider: 'whatsapp';
  providerMessageId: string;
  senderExternalId: string;
  chatExternalId: string;
  isGroup: boolean;
  isFromMe: boolean;
  receivedAt: Date;
  text: string;
  kind: 'text' | 'image' | 'document' | 'voice' | 'unknown';
  caption?: string;
  mediaMessage?: Record<string, unknown>;
  info: MessageInfo;
  raw: Record<string, unknown>;
};

export type WhatsAppClient = Pick<
  WhatsmeowClient,
  | 'init'
  | 'connect'
  | 'disconnect'
  | 'logout'
  | 'close'
  | 'getQRChannel'
  | 'pairCode'
  | 'isConnected'
  | 'isLoggedIn'
  | 'markRead'
  | 'sendChatPresence'
  | 'sendMessage'
  | 'downloadAny'
> & {
  on: WhatsmeowClient['on'];
};

export type WhatsAppClientFactory = (options: {
  store: string;
  binaryPath?: string;
  commandTimeout?: number;
}) => WhatsAppClient;

export const WHATSAPP_CLIENT_FACTORY = Symbol('WHATSAPP_CLIENT_FACTORY');

export type WhatsAppTransportMessage = {
  response: SendResponse;
  recipient: string;
};

export type WhatsAppPresence = ChatPresence;

export type WhatsAppClientEventMap = WhatsmeowEvents;
