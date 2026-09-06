import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../database/interfaces';
import { LANGUAGE_MODEL } from '../../infra/model-gateway';
import type { LanguageModelGateway } from '../../infra/model-gateway/model-gateway.types';
import { MemoryService } from './memory.service';

type Extraction = {
  action: 'ignore' | 'create';
  content?: string;
  category?: string;
  confidence?: number;
};

@Injectable()
export class AutomaticMemoryExtractorService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModelGateway,
    private readonly memories: MemoryService,
  ) {}

  async extract(
    userId: string,
    sourceMessageId: string,
    text: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user?.automaticMemoryEnabled) return;

    const result = await this.model.generate({
      messages: [
        {
          role: 'system',
          content:
            'Pilih hanya fakta atau preferensi pengguna yang berguna lintas percakapan. Jangan simpan permintaan sesaat, tugas, pengingat, rahasia, atau isi jawaban asisten. Balas JSON tunggal: {"action":"ignore"} atau {"action":"create","content":"...","category":"...","confidence":0..1}.',
        },
        { role: 'user', content: text },
      ],
    });

    const extraction = this.parse(result.text);

    if (
      extraction.action !== 'create' ||
      !extraction.content ||
      (extraction.confidence ?? 0) < 0.85
    ) {
      return;
    }

    const existing = await this.memories.search(userId, extraction.content, 1);

    if (
      existing[0]?.content.toLocaleLowerCase() ===
      extraction.content.toLocaleLowerCase()
    ) {
      return;
    }

    await this.memories.create(userId, {
      content: extraction.content,
      category: extraction.category ?? null,
      confidence: extraction.confidence,
      sourceType: 'automatic',
      sourceMessageId,
      extractorVersion: 'automatic-v1',
    });
  }

  private parse(value: string): Extraction {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return { action: 'ignore' };

    try {
      const parsed: unknown = JSON.parse(match[0]);
      if (!parsed || typeof parsed !== 'object') return { action: 'ignore' };

      const record = parsed as Record<string, unknown>;
      if (record.action !== 'create') return { action: 'ignore' };

      return {
        action: 'create',
        content:
          typeof record.content === 'string'
            ? record.content.trim()
            : undefined,
        category:
          typeof record.category === 'string'
            ? record.category.trim()
            : undefined,
        confidence:
          typeof record.confidence === 'number' ? record.confidence : undefined,
      };
    } catch {
      return { action: 'ignore' };
    }
  }
}
