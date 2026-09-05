import { User, UserProfileUpdate } from '../entities';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  updateProfile(id: string, input: UserProfileUpdate): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
