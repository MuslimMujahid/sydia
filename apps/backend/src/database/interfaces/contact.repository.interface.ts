import type { Contact, ContactWrite } from '../entities';

export interface IContactRepository {
  list(userId: string, query?: string): Promise<Contact[]>;
  findById(userId: string, id: string): Promise<Contact | null>;
  resolve(userId: string, reference: string): Promise<Contact[]>;
  create(userId: string, input: ContactWrite): Promise<Contact>;
  update(userId: string, id: string, input: Partial<ContactWrite>): Promise<Contact | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
export const CONTACT_REPOSITORY = Symbol('IContactRepository');
