import type { TokenResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";

export const API_BASE = "/api/v1";

export interface FieldError {
  field: string;
  message: string;
}

/** An RFC 7807 problem response from the backend. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors: FieldError[] = [],
    public requestId?: string,
  ) {
    super(message);
  }

  /** A sentence suitable for a toast. */
  get userMessage(): string {
    const details = this.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message));
    return [this.message, ...details].join(" · ");
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(
      res.status,
      body.code ?? "http_error",
      body.detail ?? body.title ?? res.statusText,
      body.errors ?? [],
      body.request_id,
    );
  } catch {
    return new ApiError(res.status, "http_error", res.statusText || "Request failed");
  }
}

// ---------------------------------------------------------------- session refresh

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" });
        if (res.ok) {
          const body = (await res.json()) as TokenResponse;
          useAuth.getState().setSession(body.access_token, body.user);
          return true;
        }
        const err = await toApiError(res);
        // Another tab rotated the token a moment ago; its new cookie is already set, so try once more.
        if (err.code === "refresh_conflict" && attempt === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        break;
      }
      useAuth.getState().clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// ---------------------------------------------------------------- requests

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the Authorization header (login and other public endpoints). */
  anonymous?: boolean;
}

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

export function authHeaders(): Record<string, string> {
  const { accessToken, actAs } = useAuth.getState();
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (actAs) headers["X-Act-As-Tenant"] = actAs.id;
  return headers;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.anonymous ? {} : authHeaders()), ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body; // the browser sets the multipart boundary
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
    credentials: "same-origin",
  });
}

/** Send with one silent token refresh when the access token has expired. */
async function sendAuthed(path: string, opts: RequestOptions): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !opts.anonymous) {
    const err = await toApiError(res.clone());
    if (err.code === "token_expired" && (await refreshSession())) {
      res = await send(path, opts);
    } else if (err.code !== "invalid_credentials") {
      useAuth.getState().clearSession();
    }
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

/** Call the backend. Retries once after a silent token refresh when the access token has expired. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await sendAuthed(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetch an authenticated file (e.g. a CSV report) and hand it to the browser as a download. */
export async function download(path: string, filename: string): Promise<void> {
  const blob = await (await sendAuthed(path, {})).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
