import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenRouterMediaService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly visionModel: string;
  private readonly sttModel: string;
  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BACKEND_MODEL_API_KEY');
    this.baseUrl = config.get<string>('BACKEND_MODEL_BASE_URL', 'https://openrouter.ai/api/v1');
    this.visionModel = config.get<string>('BACKEND_VISION_MODEL', 'google/gemini-2.5-flash');
    this.sttModel = config.get<string>('BACKEND_STT_MODEL', 'openai/whisper-large-v3-turbo');
  }
  async describeImage(value: Buffer, mimeType: string): Promise<string | null> {
    if (!this.apiKey) return null;
    const response = await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.visionModel, messages: [{ role: 'user', content: [{ type: 'text', text: 'Jelaskan isi gambar ini secara faktual dan rinci dalam bahasa Indonesia. Transkripsikan teks penting yang terlihat.' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${value.toString('base64')}` } }] }] }) });
    if (!response.ok) throw new Error(`Image provider returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Respons model gambar tidak valid.');
    const choices = (payload as Record<string, unknown>).choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') throw new Error('Respons model gambar tidak valid.');
    const message = (choices[0] as Record<string, unknown>).message;
    if (!message || typeof message !== 'object' || typeof (message as Record<string, unknown>).content !== 'string') throw new Error('Respons model gambar tidak valid.');
    return (message as Record<string, unknown>).content as string;
  }
  async transcribe(value: Buffer, filename: string, mimeType: string): Promise<string | null> {
    if (!this.apiKey) return null;
    const form = new FormData(); form.set('model', this.sttModel); form.set('response_format', 'json'); form.set('file', new Blob([new Uint8Array(value)], { type: mimeType }), filename);
    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form });
    if (!response.ok) throw new Error(`Transcription provider returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).text !== 'string') throw new Error('Respons transkripsi tidak valid.');
    return (payload as Record<string, unknown>).text as string;
  }
}
