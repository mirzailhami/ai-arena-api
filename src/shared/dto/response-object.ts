/**
 * Generic API response wrapper matching the platform-ui arena-manager service contract.
 * All endpoints return { success, data, message } so the UI can check response.success.
 */
export interface ResponseObject<T> {
  success: boolean;
  data: T | null;
  message: string;
}

export function okResponse<T>(data: T, message = ''): ResponseObject<T> {
  return { success: true, data, message };
}

export function failResponse<T>(message: string, data: T | null = null): ResponseObject<T> {
  return { success: false, data, message };
}
