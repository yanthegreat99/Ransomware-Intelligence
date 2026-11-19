type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Source request failed");
}
