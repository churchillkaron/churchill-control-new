export const IDEMPOTENT_USAGE_START_CONTRACT =
  "AVANTIQO_IDEMPOTENT_USAGE_START_V1";

const TRANSIENT_MARKERS = [
  "fetch failed",
  "epipe",
  "econnreset",
  "econnrefused",
  "etimedout",
  "eai_again",
  "und_err_connect_timeout",
  "und_err_socket",
  "socket hang up",
  "network error",
];

function text(value) {
  return String(value ?? "").trim();
}

function sameNullable(left, right) {
  return text(left) === text(right);
}

function isTransientCreateError(error) {
  const message = text(error?.message || error).toLowerCase();
  const code = text(error?.code).toLowerCase();
  return TRANSIENT_MARKERS.some((marker) => message.includes(marker) || code.includes(marker));
}

function assertRecoverable(existing, expected) {
  const fields = [
    "id",
    "organization_id",
    "bill_to_organization_id",
    "organization_service_id",
    "pricing_id",
    "provider",
    "capability",
    "operation",
    "currency",
  ];
  for (const field of fields) {
    if (!sameNullable(existing?.[field], expected?.[field])) {
      throw new Error(`SERVICE_USAGE_IDEMPOTENT_START_IDENTITY_CONFLICT:${field}`);
    }
  }
  if (text(existing?.status).toUpperCase() !== "PENDING") {
    throw new Error(
      `SERVICE_USAGE_IDEMPOTENT_START_STATE_CONFLICT:${text(existing?.status) || "missing"}`,
    );
  }
  if (text(existing?.provider_request_id)) {
    throw new Error("SERVICE_USAGE_IDEMPOTENT_START_ALREADY_BOUND");
  }
  return existing;
}

function retryDelayMs(attempt) {
  const index = Math.max(0, Number(attempt) || 0);
  return Math.min(200 * (2 ** index), 1600);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createIdempotentUsageRecord({
  record,
  create,
  find,
  max_attempts = 4,
  sleep = delay,
} = {}) {
  if (!record?.id) throw new Error("SERVICE_USAGE_IDEMPOTENT_START_ID_REQUIRED");
  if (typeof create !== "function") {
    throw new Error("SERVICE_USAGE_IDEMPOTENT_START_CREATE_REQUIRED");
  }
  if (typeof find !== "function") {
    throw new Error("SERVICE_USAGE_IDEMPOTENT_START_FIND_REQUIRED");
  }

  const preexisting = await find(record.id);
  if (preexisting) {
    throw new Error("SERVICE_USAGE_IDEMPOTENT_START_PREEXISTING");
  }

  const maximum = Math.max(1, Math.min(8, Number(max_attempts) || 4));
  let lastError = null;

  for (let attempt = 0; attempt < maximum; attempt += 1) {
    try {
      return await create(record);
    } catch (error) {
      lastError = error;
      if (!isTransientCreateError(error)) throw error;

      const recovered = await find(record.id);
      if (recovered) return assertRecoverable(recovered, record);
      if (attempt === maximum - 1) throw error;
      await sleep(retryDelayMs(attempt));
    }
  }

  throw lastError || new Error("SERVICE_USAGE_IDEMPOTENT_START_FAILED");
}

export const IdempotentUsageStart = Object.freeze({
  contract: IDEMPOTENT_USAGE_START_CONTRACT,
  create: createIdempotentUsageRecord,
});
