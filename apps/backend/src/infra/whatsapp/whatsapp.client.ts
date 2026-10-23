import { Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(GoWhatsAppHttpClient.name);
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

  /** Fetch provider QR server-side; its asset URL never crosses the public API. */
  async loginQr(): Promise<{ image: Buffer; durationSeconds: number }> {
    if (!this.deviceId)
      throw new Error('QR login requires an explicit device.');
    const result = await this.request<{ qr_link: string; qr_duration: number }>(
      'GET',
      '/app/login',
    );

    if (
      !Number.isFinite(result.qr_duration) ||
      result.qr_duration <= 0 ||
      result.qr_duration > 300
    )
      throw new Error('GoWA returned invalid QR validity.');
    const source = new URL(result.qr_link, this.baseUrl);
    const base = new URL(this.baseUrl);
    const root = base.pathname.replace(/\/$/, '');
    const prefixes = [
      root + '/statics/qrcode/',
      root + '/statics/images/qrcode/',
    ];

    const trustedPath = prefixes.some(
      (prefix) =>
        source.pathname.startsWith(prefix) &&
        /^scan-qr-[a-f0-9-]+\.png$/i.test(source.pathname.slice(prefix.length)),
    );

    if (
      source.origin !== base.origin ||
      source.username ||
      source.password ||
      source.search ||
      source.hash ||
      !trustedPath
    )
      throw new Error('GoWA returned an untrusted QR asset URL.');
    const response = await fetch(source, {
      headers: { 'X-Device-Id': this.deviceId },
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0] !== 'image/png' ||
      !response.body
    )
      throw new Error(
        'GoWA QR asset is unavailable or has an invalid content type.',
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;

        if (size > 256_000) {
          await reader.cancel();
          throw new Error('GoWA QR asset exceeds the size limit.');
        }

        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }

    const image = Buffer.concat(chunks);
    if (
      !image
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error('GoWA QR asset is not a PNG.');

    return { image, durationSeconds: result.qr_duration };
  }

  async removeDevice(): Promise<void> {
    if (!this.deviceId)
      throw new Error('Device removal requires an explicit device.');
    await this.request<unknown>(
      'DELETE',
      `/devices/${encodeURIComponent(this.deviceId)}`,
    );
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
    if (!this.deviceId && path !== '/devices') {
      this.logger.error(
        'WhatsApp operation rejected without an explicit device.',
      );
      throw new Error('WhatsApp operation requires an explicit device.');
    }

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
      } catch (error) {
        this.logger.error('GoWA returned a malformed JSON response.');
        throw new Error('GoWA returned a malformed JSON response.', {
          cause: error,
        });
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
