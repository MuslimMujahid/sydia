import type { User } from '../entities';

export interface IChatPreviewRepository {
  createSandboxes(ids: readonly string[], profile: User): Promise<void>;
}

export const CHAT_PREVIEW_REPOSITORY = Symbol('IChatPreviewRepository');
