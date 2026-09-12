import type {
  GoWaDownloadResult,
  GoWaSendResult,
  GoWaStatus,
  WhatsAppClient,
  WhatsAppClientOptions,
} from './whatsapp.types';

type Envelope<T> = { code: string; message: string; results: T };

export type GoWaHttpError = Error & { code?: string; status?: number };

export class GoWhatsAppHttpClient implements WhatsAppClient {
  private readonly baseUrl: string;
  private readonly deviceId?: string;
  private readonly timeoutMs: number;

  constructor(options: WhatsAppClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.deviceId = options.deviceId;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async ensureDevice(deviceId: string): Promise<void> {
    try {
      await this.request<Record<string, unknown>>('POST', '/devices', {
        device_id: deviceId,
      });
    } catch (error) {
      // A device that already exists is not an error; any other failure is.
      if (!this.isAlreadyExists(error)) throw error;
    }
  }

  async status(): Promise<GoWaStatus> {
    return this.request<GoWaStatus>('GET', '/app/status');
  }

  async pairCode(phone: string): Promise<string> {
    const result = await this.request<{ pair_code: string }>(
      'GET',
      `/app/login-with-code?phone=${encodeURIComponent(phone)}`,
    );

    return result.pair_code;
  }

  async logout(): Promise<void> {
    await this.request<unknown>('GET', '/app/logout');
  }

  async reconnect(): Promise<void> {
    await this.request<unknown>('GET', '/app/reconnect');
  }

  async sendText(phone: string, message: string): Promise<GoWaSendResult> {
    return this.request<GoWaSendResult>('POST', '/send/message', {
      phone,
      message,
    });
  }

  async sendFile(
    phone: string,
    file: { filename: string; mimeType: string; buffer: Buffer },
    caption?: string,
    replyMessageId?: string,
  ): Promise<GoWaSendResult> {
    const body = new FormData();
    body.append('phone', phone);
    body.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
      file.filename,
    );
    if (caption) body.append('caption', caption);
    if (replyMessageId) body.append('reply_message_id', replyMessageId);

    return this.request<GoWaSendResult>('POST', '/send/file', body);
  }

  async markRead(phone: string, messageId: string): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/message/${encodeURIComponent(messageId)}/read`,
      { phone },
    );
  }

  async sendChatPresence(
    phone: string,
    action: 'composing' | 'paused',
  ): Promise<void> {
    await this.request<unknown>('POST', '/send/chat-presence', {
      phone,
      action: action === 'composing' ? 'start' : 'stop',
    });
  }

  async downloadMedia(
    phone: string,
    messageId: string,
  ): Promise<GoWaDownloadResult> {
    return this.request<GoWaDownloadResult>(
      'GET',
      `/message/${encodeURIComponent(messageId)}/download?phone=${encodeURIComponent(phone)}`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.deviceId) headers['X-Device-Id'] = this.deviceId;
    let payload: BodyInit | undefined;

    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });

      const text = await response.text();
      let json: Envelope<T> | undefined;

      try {
        json = text ? (JSON.parse(text) as Envelope<T>) : undefined;
      } catch {
        /* non-JSON response body */
      }

      if (!response.ok) {
        const error = new Error(
          json?.message ??
            (text || `WhatsApp gateway returned ${response.status}`),
        ) as GoWaHttpError;

        error.code = json?.code ?? `HTTP_${response.status}`;
        error.status = response.status;
        throw error;
      }

      if (!json) throw new Error('Empty response from WhatsApp gateway');

      return json.results;
    } finally {
      clearTimeout(timer);
    }
  }

  private isAlreadyExists(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('already exists')
    );
  }
}
