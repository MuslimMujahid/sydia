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
  raw: Record<string, unknown>;
};

export type GoWaStatus = {
  device_id: string;
  is_connected: boolean;
  is_logged_in: boolean;
  jid: string;
};

export type GoWaSendResult = {
  message_id: string;
  status: string;
};

export type GoWaDownloadResult = {
  message_id: string;
  status: string;
  media_type: string;
  filename: string;
  file_path: string;
  file_url?: string;
  file_size: number;
};

export type GoWaWebhookMessage = {
  event: 'message';
  device_id?: string;
  timestamp?: string;
  payload: {
    id: string;
    chat_id?: string;
    from?: string;
    from_name?: string;
    timestamp?: string;
    is_from_me?: boolean;
    body?: string;
    image?: string | Record<string, unknown>;
    video?: string | Record<string, unknown>;
    audio?: string | Record<string, unknown>;
    document?: string | Record<string, unknown>;
    sticker?: string | Record<string, unknown>;
    video_note?: string | Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type GoWaWebhookReceipt = {
  event: 'message.ack';
  device_id?: string;
  timestamp?: string;
  payload: {
    ids: string[];
    chat_id?: string;
    from?: string;
    receipt_type?: string;
    [key: string]: unknown;
  };
};

export type GoWaWebhookEvent =
  | GoWaWebhookMessage
  | GoWaWebhookReceipt
  | {
      event: string;
      payload?: Record<string, unknown>;
      [key: string]: unknown;
    };

/**
 * Provider-agnostic transport surface consumed by the gateway. Implemented by
 * the go-whatsapp-web-multidevice HTTP client; the domain layer never sees it.
 */
export interface WhatsAppClient {
  ensureDevice(deviceId: string): Promise<void>;
  status(): Promise<GoWaStatus>;
  pairCode(phone: string): Promise<string>;
  logout(): Promise<void>;
  reconnect(): Promise<void>;
  sendText(phone: string, message: string): Promise<GoWaSendResult>;
  markRead(phone: string, messageId: string): Promise<void>;
  sendChatPresence(
    phone: string,
    action: 'composing' | 'paused',
  ): Promise<void>;
  downloadMedia(phone: string, messageId: string): Promise<GoWaDownloadResult>;
}

export type WhatsAppClientOptions = {
  baseUrl: string;
  deviceId?: string;
  timeoutMs?: number;
};

export type WhatsAppClientFactory = (
  options: WhatsAppClientOptions,
) => WhatsAppClient;

export const WHATSAPP_CLIENT_FACTORY = Symbol('WHATSAPP_CLIENT_FACTORY');
