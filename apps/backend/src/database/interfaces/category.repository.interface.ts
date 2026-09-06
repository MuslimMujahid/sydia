import type { Category, CategoryWrite } from '../entities';

export interface ICategoryRepository {
  list(userId: string): Promise<Category[]>;
  findByNames(userId: string, names: string[]): Promise<Category[]>;
  create(userId: string, input: CategoryWrite): Promise<Category>;
  update(
    userId: string,
    id: string,
    input: Partial<CategoryWrite>,
  ): Promise<Category | null>;
  delete(userId: string, id: string): Promise<Category | null>;
  provisionDefaults(userId: string): Promise<void>;
}

export const CATEGORY_REPOSITORY = Symbol('ICategoryRepository');
