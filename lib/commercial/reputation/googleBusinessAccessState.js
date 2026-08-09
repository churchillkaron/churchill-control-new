const ACCOUNT_MANAGEMENT_SERVICE =
  "mybusinessaccountmanagement.googleapis.com";

const API_ACCESS_RETRY_MS = 24 * 60 * 60 * 1000;

export function isGoogleBusinessQuotaError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    Number(error?.status) === 429 ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

export function isGoogleBusinessApiAccessPending(error, connection = null) {
  const message = String(error?.message || "").toLowerCase();
  const metadata = connection?.metadata || {};
  const previousStatus = String(
    metadata.location_discovery_status || ""
  ).toUpperCase();
  const previousFailures = Math.max(
    Number(metadata.location_discovery_failures || 0),
    0
  );

  if (!isGoogleBusinessQuotaError(error)) return false;
  if (!message.includes(ACCOUNT_MANAGEMENT_SERVICE)) return false;

  return (
    previousStatus === "API_ACCESS_PENDING" ||
    previousFailures >= 1
  );
}

export function googleBusinessDiscoveryFailureState({
  error,
  connection = null,
  transientRetryMs = 15 * 60 * 1000,
  quotaRetryMs = 60 * 60 * 1000,
  maxRetryMs = 6 * 60 * 60 * 1000,
} = {}) {
  const quotaLimited = isGoogleBusinessQuotaError(error);
  const apiAccessPending = isGoogleBusinessApiAccessPending(
    error,
    connection
  );
  const previousFailures = Math.max(
    Number(connection?.metadata?.location_discovery_failures || 0),
    0
  );
  const failures = previousFailures + 1;

  if (apiAccessPending) {
    return {
      quotaLimited: true,
      apiAccessPending: true,
      status: "API_ACCESS_PENDING",
      failures,
      retryAt: new Date(
        Date.now() + API_ACCESS_RETRY_MS
      ).toISOString(),
      code: "GOOGLE_API_ACCESS_PENDING",
    };
  }

  const baseDelay = quotaLimited
    ? quotaRetryMs
    : transientRetryMs;
  const delay = Math.min(
    baseDelay * Math.pow(2, Math.min(failures - 1, 4)),
    maxRetryMs
  );

  return {
    quotaLimited,
    apiAccessPending: false,
    status: quotaLimited ? "RATE_LIMITED" : "PENDING",
    failures,
    retryAt: new Date(Date.now() + delay).toISOString(),
    code: quotaLimited
      ? "GOOGLE_QUOTA_LIMIT"
      : "GOOGLE_DISCOVERY_PENDING",
  };
}
