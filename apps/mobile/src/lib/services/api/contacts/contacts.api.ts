import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type ContactGroupRef = { id: string; name: string };

export type Contact = {
  id: string;
  name: string;
  aliases: string[];
  email: string | null;
  phone: string | null;
  notes: string | null;
  groups: ContactGroupRef[];
  createdAt: string;
  updatedAt: string;
};

export type ContactWriteInput = {
  name: string;
  aliases?: string[];
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  groupIds?: string[];
};

export type UpdateContactInput = {
  contactId: string;
  values: Partial<ContactWriteInput>;
};

export async function getContacts(
  query = "",
  groupId?: string
): Promise<Contact[]> {
  try {
    const response = await api.get<ApiResponse<Contact[]>>("/contacts", {
      params: { q: query.trim() || undefined, groupId: groupId || undefined },
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar kontak tidak dapat dimuat.");
  }
}

export async function getContact(contactId: string): Promise<Contact> {
  try {
    const response = await api.get<ApiResponse<Contact>>(
      `/contacts/${encodeURIComponent(contactId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Rincian kontak tidak dapat dimuat.");
  }
}

export async function createContact(
  values: ContactWriteInput
): Promise<Contact> {
  try {
    const response = await api.post<ApiResponse<Contact>>("/contacts", values);

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kontak tidak dapat disimpan.");
  }
}

export async function updateContact({
  contactId,
  values,
}: UpdateContactInput): Promise<Contact> {
  try {
    const response = await api.patch<ApiResponse<Contact>>(
      `/contacts/${encodeURIComponent(contactId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan kontak tidak dapat disimpan.");
  }
}

export async function deleteContact(contactId: string): Promise<void> {
  try {
    await api.delete(`/contacts/${encodeURIComponent(contactId)}`);
  } catch (error) {
    throw toApiError(error, "Kontak tidak dapat dihapus.");
  }
}
