import {
  SUPABASE_NETWORK_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRetryableHttpStatus,
  isTransientNetworkError,
} from "./CodeAICertificationResiliencePolicy.js";

export const CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT =
  "AVANTIQO_CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_V1";

function text(value) {
  return String(value ?? "").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestUrl(input) {
  try {
    return new URL(
      typeof input === "string" || input instanceof URL
        ? input
        : input?.url,
    );
  } catch {
    return null;
  }
}

function requestMethod(input, init = {}) {
  return text(init?.method || input?.method || "GET").toUpperCase();
}

function retryableSupabaseSafeRead(input, init = {}, supabaseOrigin = "") {
  const url = requestUrl(input);
  if (!url || !supabaseOrigin) return false;

  let expectedOrigin;
  try {
    expectedOrigin = new URL(supabaseOrigin).origin;
  } catch {
    return false;
  }

  const method = requestMethod(input, init);
  return (
    url.origin === expectedOrigin &&
    (method === "GET" || method === "HEAD")
  );
}

export function createCodeCertificationSupabaseSafeReadFetch({
  base_fetch = globalThis.fetch,
  supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  max_attempts = SUPABASE_NETWORK_MAX_ATTEMPTS,
  on_retry = null,
} = {}) {
  if (typeof base_fetch !== "function") {
    throw new Error("CODE_AI_CERTIFICATION_SUPABASE_BASE_FETCH_REQUIRED");
  }

  const maximum = Math.max(
    1,
    Math.min(8, Number(max_attempts) || SUPABASE_NETWORK_MAX_ATTEMPTS),
  );
  const origin = text(supabase_url);

  return async function codeCertificationSupabaseSafeReadFetch(input, init = {}) {
    if (!retryableSupabaseSafeRead(input, init, origin)) {
      return base_fetch(input, init);
    }

    let lastError = null;
    for (let attempt = 0; attempt < maximum; attempt += 1) {
      try {
        const response = await base_fetch(input, init);
        if (
          !isRetryableHttpStatus(response?.status) ||
          attempt === maximum - 1
        ) {
          return response;
        }
        lastError = new Error(
          `CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_HTTP_${response.status}`,
        );
      } catch (error) {
        lastError = error;
        if (
          !isTransientNetworkError(error) ||
          attempt === maximum - 1
        ) {
          throw error;
        }
      }

      const retry = {
        event: "AVANTIQO_CODE_CERTIFICATION_SUPABASE_SAFE_READ_RETRY",
        contract: CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT,
        attempt: attempt + 1,
        max_attempts: maximum,
        method: requestMethod(input, init),
        reason: text(lastError?.message || lastError).slice(0, 180),
        provider_execution_submitted: false,
        wallet_mutation_performed: false,
        usage_write_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      };
      if (typeof on_retry === "function") on_retry(retry);
      else console.error(JSON.stringify(retry));

      await delay(boundedRetryDelayMs(attempt));
    }

    throw lastError || new Error(
      "CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_RETRY_EXHAUSTED",
    );
  };
}

export function installCodeCertificationSupabaseSafeReadRetry(options = {}) {
  const originalFetch = options.base_fetch || globalThis.fetch;
  const wrappedFetch = createCodeCertificationSupabaseSafeReadFetch({
    ...options,
    base_fetch: originalFetch,
  });
  globalThis.fetch = wrappedFetch;

  return function restoreCodeCertificationSupabaseSafeReadRetry() {
    if (globalThis.fetch === wrappedFetch) {
      globalThis.fetch = originalFetch;
    }
  };
}

export const CodeAICertificationSupabaseReadResilience = Object.freeze({
  contract: CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_CONTRACT,
  createFetch: createCodeCertificationSupabaseSafeReadFetch,
  install: installCodeCertificationSupabaseSafeReadRetry,
});
