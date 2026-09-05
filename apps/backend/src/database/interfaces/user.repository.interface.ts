import { User } from '../entities';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
