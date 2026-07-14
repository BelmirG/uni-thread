// All paths are relative (e.g. "/api/auth/login").
// Next.js rewrites them to the backend — see next.config.js.
// credentials: "include" tells the browser to send the httpOnly cookie
// on every request, even though it can't read the cookie itself.

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      credentials: "include",
      // Abort after 20s instead of hanging forever. Without this, a request
      // cut off mid-flight (e.g. iOS suspending the home-screen app) never
      // settles, leaving buttons stuck on "Posting…" until a force-quit.
      signal:
        options?.signal ??
        (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(20_000)
          : undefined),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ApiError("Request timed out — check your connection and try again.", 0);
    }
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: unknown };
    const { detail } = body;

    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string };
      const field = Array.isArray(first.loc) ? String(first.loc.at(-1)) : "";
      message = field ? `${field}: ${first.msg ?? "invalid value"}` : (first.msg ?? "Validation error");
    } else {
      message = `Request failed (HTTP ${res.status})`;
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
