export const CODE_AI_ERROR_SANITIZATION_CONTRACT =
  "AVANTIQO_CODE_AI_ERROR_SANITIZATION_V1";

const TRANSIENT_STATUS = /\b(500|502|503|504|520|521|522|523|524)\b/;
const TRANSIENT_SIGNAL =
  /web server is down|temporarily unavailable|bad gateway|gateway timeout|upstream.*(?:error|timeout)|econnreset|econnrefused|etimedout|fetch failed|network.*(?:error|timeout)|socket hang up|ssl handshake/i;
const HTML_SIGNAL = /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i;

function rawText(value) {
  if (value instanceof Error) return String(value.message || value);
  return String(value ?? "");
}

export function isCodeAITransientInfrastructureError(value) {
  const raw = rawText(value).slice(0, 12000);
  return Boolean(
    TRANSIENT_STATUS.test(raw) ||
    TRANSIENT_SIGNAL.test(raw) ||
    (HTML_SIGNAL.test(raw) && /cloudflare|supabase|gateway|server is down|error code/i.test(raw))
  );
}

export function sanitizeCodeAIErrorReason(value, {
  fallback = "CODE_AI_OPERATION_FAILED",
  label = "UPSTREAM",
  maximum = 2000,
} = {}) {
  const raw = rawText(value).trim();
  if (!raw) return fallback;
  if (isCodeAITransientInfrastructureError(raw)) {
    const status = raw.match(TRANSIENT_STATUS)?.[1] || null;
    return status
      ? `CODE_AI_TRANSIENT_INFRASTRUCTURE_FAILURE:${label}:HTTP_${status}`
      : `CODE_AI_TRANSIENT_INFRASTRUCTURE_FAILURE:${label}`;
  }
  return raw
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t ]+/g, " ")
    .slice(0, Math.max(120, Number(maximum) || 2000));
}

export function sanitizedCodeAIErrorDetails(error, maximum = 3000) {
  if (isCodeAITransientInfrastructureError(error)) {
    return {
      contract: CODE_AI_ERROR_SANITIZATION_CONTRACT,
      transient_infrastructure_failure: true,
      raw_transport_payload_persisted: false,
    };
  }
  const details = error && typeof error === "object" ? error.details : null;
  if (details === null || details === undefined) return null;
  const serialized = JSON.stringify(details);
  if (!serialized) return null;
  return serialized.length <= maximum
    ? details
    : {
        contract: CODE_AI_ERROR_SANITIZATION_CONTRACT,
        details_truncated: true,
        serialized_preview: serialized.slice(0, maximum),
      };
}

export default Object.freeze({
  contract: CODE_AI_ERROR_SANITIZATION_CONTRACT,
  isTransientInfrastructureError: isCodeAITransientInfrastructureError,
  sanitizeReason: sanitizeCodeAIErrorReason,
  sanitizeDetails: sanitizedCodeAIErrorDetails,
});
