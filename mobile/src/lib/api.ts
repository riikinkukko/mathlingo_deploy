import { API_URL } from "./config";

/** Ошибка запроса к серверу. offline — нет связи (или сервер недоступен). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public offline = false
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(t: string | null) {
  token = t;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Нет связи с сервером", 0, true);
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    const message = (data as { error?: string } | null)?.error ?? `Ошибка сервера (${res.status})`;
    throw new ApiError(message, res.status, res.status >= 502 && res.status <= 504);
  }
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.offline ? "Нет интернета. Попробуй ещё раз, когда появится связь." : e.message;
  return "Что-то пошло не так";
}
