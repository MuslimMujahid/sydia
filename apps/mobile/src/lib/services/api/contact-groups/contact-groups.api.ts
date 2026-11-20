import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type ContactGroup = {
  id: string;
  name: string;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
};
export type ContactGroupInput = Pick<ContactGroup, "name">;

export async function getContactGroups(): Promise<ContactGroup[]> {
  try {
    const response =
      await api.get<ApiResponse<ContactGroup[]>>("/contact-groups");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Grup tidak dapat dimuat.");
  }
}

export async function createContactGroup(
  values: ContactGroupInput
): Promise<ContactGroup> {
  try {
    const response = await api.post<ApiResponse<ContactGroup>>(
      "/contact-groups",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Grup tidak dapat dibuat.");
  }
}

export async function updateContactGroup({
  contactGroupId,
  values,
}: {
  contactGroupId: string;
  values: Partial<ContactGroupInput>;
}): Promise<ContactGroup> {
  try {
    const response = await api.patch<ApiResponse<ContactGroup>>(
      `/contact-groups/${encodeURIComponent(contactGroupId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Grup tidak dapat diperbarui.");
  }
}

export async function deleteContactGroup(
  contactGroupId: string
): Promise<ContactGroup> {
  try {
    const response = await api.delete<ApiResponse<ContactGroup>>(
      `/contact-groups/${encodeURIComponent(contactGroupId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Grup tidak dapat dihapus.");
  }
}
