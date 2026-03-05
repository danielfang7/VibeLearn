// Typed fetch client — built during a TypeScript learning session

export interface ApiError {
  status: number;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function get<T>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: { status: response.status, message: response.statusText } };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: { status: 0, message: String(err) } };
  }
}

export async function fetchAll<T>(urls: string[]): Promise<ApiResult<T>[]> {
  return Promise.all(urls.map((url) => get<T>(url)));
}
