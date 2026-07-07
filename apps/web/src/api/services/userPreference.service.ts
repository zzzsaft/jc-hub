import { apiClient } from "@/api/http/client";

const unwrap = <T>(response: { data: T }) => response.data;

export interface UserPreferenceResponse<T> {
  key?: string;
  value?: T;
  data?: T | { value?: T };
  preference?: { value?: T };
  [key: string]: unknown;
}

const valueFromResponse = <T>(response: UserPreferenceResponse<T> | T): T | null => {
  if (response == null) return null;
  if (typeof response !== "object") return response as T;
  const wrapped = response as UserPreferenceResponse<T>;
  if (wrapped?.preference && "value" in wrapped.preference) return wrapped.preference.value ?? null;
  if (wrapped?.data && typeof wrapped.data === "object" && !Array.isArray(wrapped.data) && "value" in wrapped.data) {
    return (wrapped.data as { value?: T }).value ?? null;
  }
  if ("value" in wrapped) return wrapped.value ?? null;
  if ("data" in wrapped) return (wrapped.data as T) ?? null;
  return response as T;
};

export const UserPreferenceService = {
  async getPreference<T>(key: string): Promise<T | null> {
    const response = unwrap<UserPreferenceResponse<T> | T>(
      await apiClient.get(`/user-preferences/${encodeURIComponent(key)}`),
    );
    return valueFromResponse<T>(response);
  },

  async savePreference<T>(key: string, value: T): Promise<void> {
    await apiClient.put(`/user-preferences/${encodeURIComponent(key)}`, { value });
  },
};
