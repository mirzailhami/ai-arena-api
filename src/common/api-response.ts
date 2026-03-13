export interface ResponseObject<T> {
  data: T
  success: boolean
  message: string
}

export function responseOf<T>(
  data: T,
  success: boolean,
  message: string,
): ResponseObject<T> {
  return { data, message, success }
}
