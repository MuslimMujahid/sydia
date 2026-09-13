import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenRouterMediaService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly sttModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BACKEND_MODEL_API_KEY');
    this.baseUrl = config.get<string>(
      'BACKEND_MODEL_BASE_URL',
      'https://openrouter.ai/api/v1',
    );
    this.sttModel = config.get<string>(
      'BACKEND_STT_MODEL',
      'openai/whisper-large-v3-turbo',
    );
  }

  async transcribe(
    value: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string | null> {
    if (!this.apiKey) return null;
    const form = new FormData();
    form.set('model', this.sttModel);
    form.set('response_format', 'json');
    form.set(
      'file',
      new Blob([new Uint8Array(value)], { type: mimeType }),
      filename,
    );
    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok)
      throw new Error(`Transcription provider returned ${response.status}`);
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as Record<string, unknown>).text !== 'string'
    )
      throw new Error('The transcription model returned an invalid response.');

    return (payload as Record<string, unknown>).text as string;
  }
}
