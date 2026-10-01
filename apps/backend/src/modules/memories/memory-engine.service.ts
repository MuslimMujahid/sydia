import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MemoryEngineMode } from '../../infra/hindsight';

@Injectable()
export class MemoryEngineService {
  private readonly mode: MemoryEngineMode;
  private readonly cohort: Set<string>;
  private readonly retiredNamespaces: Set<string>;
  readonly namespace: string;
  readonly ingestionEnabled: boolean;
  readonly autoRecallEnabled: boolean;
  readonly recallTokens: number;

  constructor(config: ConfigService) {
    this.mode = config.get<MemoryEngineMode>('BACKEND_MEMORY_ENGINE', 'legacy');
    this.cohort = new Set(
      config
        .get<string>('BACKEND_HINDSIGHT_COHORT', '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    this.namespace = config.get<string>('BACKEND_HINDSIGHT_NAMESPACE', '');
    this.retiredNamespaces = new Set(
      config
        .get<string>('BACKEND_HINDSIGHT_RETIRED_NAMESPACES', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap((value) => [value, `${value}-shadow`]),
    );
    this.ingestionEnabled = config.get<boolean>(
      'BACKEND_HINDSIGHT_INGESTION_ENABLED',
      false,
    );
    this.autoRecallEnabled = config.get<boolean>(
      'BACKEND_MEMORY_AUTO_RECALL_ENABLED',
      false,
    );
    this.recallTokens = config.get<number>(
      'BACKEND_HINDSIGHT_RECALL_TOKENS',
      800,
    );
  }

  modeFor(userId: string): MemoryEngineMode {
    return !this.cohort.size || this.cohort.has(userId) ? this.mode : 'legacy';
  }

  canForgetNamespace(namespace: string, retiredBank: boolean): boolean {
    return (
      namespace === this.namespace ||
      (retiredBank && this.retiredNamespaces.has(namespace))
    );
  }

  bankId(userId: string, shadow = false): string {
    // Opaque, deterministic ownership mapping. Shadow namespace cannot share
    // sources or checkpoints with the active corpus.
    return `${shadow ? this.shadowNamespace() : this.namespace}-${createHash('sha256').update(userId).digest('hex')}`;
  }

  shadowNamespace(): string {
    return `${this.namespace}-shadow`;
  }

  configuredMode(): MemoryEngineMode {
    return this.mode;
  }

  cohortUserIds(): string[] {
    return [...this.cohort];
  }
}
