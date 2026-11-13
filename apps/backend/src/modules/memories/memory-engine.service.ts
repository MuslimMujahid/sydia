import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Hindsight settings; memory is off when the deployment does not configure it. */
@Injectable()
export class MemoryEngineService {
  private readonly retiredNamespaces: Set<string>;
  /** Hindsight URL, API key, and namespace are all present. */
  readonly configured: boolean;
  readonly namespace: string;
  readonly ingestionEnabled: boolean;
  readonly autoRecallEnabled: boolean;
  readonly recallTokens: number;

  constructor(config: ConfigService) {
    this.namespace = config.get<string>('BACKEND_HINDSIGHT_NAMESPACE', '');
    this.configured = Boolean(
      this.namespace &&
      config.get<string>('BACKEND_HINDSIGHT_URL') &&
      config.get<string>('BACKEND_HINDSIGHT_API_KEY'),
    );
    this.retiredNamespaces = new Set(
      config
        .get<string>('BACKEND_HINDSIGHT_RETIRED_NAMESPACES', '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .flatMap((value) => [value, `${value}-shadow`]),
    );
    this.ingestionEnabled =
      this.configured &&
      config.get<boolean>('BACKEND_HINDSIGHT_INGESTION_ENABLED', false);
    this.autoRecallEnabled =
      this.configured &&
      config.get<boolean>('BACKEND_MEMORY_AUTO_RECALL_ENABLED', false);
    this.recallTokens = config.get<number>(
      'BACKEND_HINDSIGHT_RECALL_TOKENS',
      800,
    );
  }

  canForgetNamespace(namespace: string, retiredBank: boolean): boolean {
    return (
      namespace === this.namespace ||
      (retiredBank && this.retiredNamespaces.has(namespace))
    );
  }

  /** Opaque, deterministic ownership mapping for the active namespace. */
  bankId(userId: string): string {
    return `${this.namespace}-${createHash('sha256').update(userId).digest('hex')}`;
  }
}
