import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingsService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  readonly version = 'v1';

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BACKEND_MODEL_API_KEY', '');
    this.baseUrl = config.get<string>(
      'BACKEND_MODEL_BASE_URL',
      'https://openrouter.ai/api/v1',
    );
    this.model = config.get<string>(
      'BACKEND_EMBEDDING_MODEL',
      'openai/text-embedding-3-small',
    );
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.apiKey) return null;
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok)
      throw new Error(`Embedding provider returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!this.isEmbeddingResponse(payload))
      throw new Error('Embedding provider returned an invalid response');

    return payload.data[0].embedding;
  }

  modelName(): string {
    return this.model;
  }

  private isEmbeddingResponse(
    value: unknown,
  ): value is { data: [{ embedding: number[] }] } {
    if (!value || typeof value !== 'object') return false;

    const record = value as Record<string, unknown>;
    const data = record.data;

    if (!Array.isArray(data) || !data[0] || typeof data[0] !== 'object') {
      return false;
    }

    const item = data[0] as Record<string, unknown>;
    const embedding = item.embedding;

    return (
      Array.isArray(embedding) &&
      embedding.every((element: unknown) => typeof element === 'number')
    );
  }
}
