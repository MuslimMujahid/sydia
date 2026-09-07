import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type Contact = {
  id: string;
  name: string;
  aliases: string[];
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactWriteInput = {
  name: string;
  aliases?: string[];
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type UpdateContactInput = {
  contactId: string;
  values: Partial<ContactWriteInput>;
};

const contactQuerySchema = z.string();
const contactIdSchema = z.string().min(1);

const getContactsServer = createServerFn({ method: "GET" })
  .validator(contactQuerySchema)
  .handler(async ({ data: query }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Contact[]>>("/contacts", {
        params: { q: query.trim() || undefined },
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar kontak tidak dapat dimuat.");
    }
  });

const getContactServer = createServerFn({ method: "GET" })
  .validator(contactIdSchema)
  .handler(async ({ data: contactId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Contact>>(
        `/contacts/${encodeURIComponent(contactId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Rincian kontak tidak dapat dimuat.");
    }
  });

export async function getContacts(query = ""): Promise<Contact[]> {
  if (typeof window === "undefined") return getContactsServer({ data: query });

  try {
    const response = await api.get<ApiResponse<Contact[]>>("/contacts", {
      params: { q: query.trim() || undefined },
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar kontak tidak dapat dimuat.");
  }
}

export async function getContact(contactId: string): Promise<Contact> {
  if (typeof window === "undefined")
    return getContactServer({ data: contactId });

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
