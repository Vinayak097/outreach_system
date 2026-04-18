const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  const body: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = body as { error?: string; details?: unknown };
    throw new ApiError(res.status, err.error ?? "request_failed", err.details);
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export const api = {
  login: (password: string) =>
    request<{ ok: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ ok: true }>("/auth/me"),
  health: () => request<{ ok: true }>("/health"),
};
