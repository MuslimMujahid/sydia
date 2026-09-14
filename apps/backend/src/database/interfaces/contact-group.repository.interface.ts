import type { ContactGroup, ContactGroupWrite } from '../entities';

export interface IContactGroupRepository {
  list(userId: string): Promise<ContactGroup[]>;
  findById(userId: string, id: string): Promise<ContactGroup | null>;
  findByNames(userId: string, names: string[]): Promise<ContactGroup[]>;
  create(userId: string, input: ContactGroupWrite): Promise<ContactGroup>;
  update(
    userId: string,
    id: string,
    input: Partial<ContactGroupWrite>,
  ): Promise<ContactGroup | null>;
  delete(userId: string, id: string): Promise<ContactGroup | null>;
}
export const CONTACT_GROUP_REPOSITORY = Symbol('IContactGroupRepository');
