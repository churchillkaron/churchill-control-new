export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  DEVELOPER_API_VERSION,
  DEVELOPER_MUTATION_MAX_BODY_BYTES,
} from "@/lib/developer/DeveloperApiContract";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  authorizeOperationsAccess,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  claimDeveloperApiIdempotency,
  claimDeveloperEnvironmentQuota,
  claimDeveloperEnvironmentRateLimit,
  developerMutationRequestHash,
  developerRequestId,
  recordDeveloperApiRequest,
  resolveDeveloperMachineIdentity,
  settleDeveloperApiIdempotency,
} from "@/lib/developer/DeveloperApiTokenRuntime";



function response(
  body,
  status,
  requestId,
  rate = null,
  environment = null,
  monthly = null,
  idempotentReplay = false,
  retryAfterSeconds = null,
) {
  const headers = new Headers({
    "x-request-id": requestId,
    "x-avantiqo-api-version": DEVELOPER_API_VERSION,
  });
  if (environment) headers.set("x-avantiqo-environment", environment);
  if (rate) {
    headers.set("x-ratelimit-limit", String(rate.limit));
    headers.set("x-ratelimit-remaining", String(Math.max(0, rate.limit - rate.count)));
    if (rate.window_start) {
      const reset = new Date(rate.window_start).getTime() + 60_000;
      headers.set("x-ratelimit-reset", String(Math.floor(reset / 1000)));
    }
  }
  if (monthly) {
    headers.set("x-avantiqo-monthly-usage", String(monthly.count));
    if (monthly.month_start) {
      const start = new Date(monthly.month_start + "T00:00:00.000Z");
      const reset = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0);
      headers.set("x-avantiqo-monthly-reset", String(Math.floor(reset / 1000)));
    }
    if (monthly.limit !== null) {
      headers.set("x-avantiqo-monthly-limit", String(monthly.limit));
      headers.set("x-avantiqo-monthly-remaining", String(Math.max(0, monthly.limit - monthly.count)));
    }
  }
  if (retryAfterSeconds !== null) headers.set("retry-after", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  if (idempotentReplay) headers.set("x-avantiqo-idempotent-replay", "true");
  return NextResponse.json(body, { status, headers });
}

async function boundedJson(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return { success: false, status: 415, error: "Content-Type must be application/json" };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DEVELOPER_MUTATION_MAX_BODY_BYTES) {
    return { success: false, status: 413, error: "Request body exceeds 256 KiB" };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { success: false, status: 400, error: "Request body could not be read" };
  }

  if (new TextEncoder().encode(text).byteLength > DEVELOPER_MUTATION_MAX_BODY_BYTES) {
    return { success: false, status: 413, error: "Request body exceeds 256 KiB" };
  }

  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return { success: false, status: 400, error: "JSON request body must be an object" };
    }
    return { success: true, body };
  } catch {
    return { success: false, status: 400, error: "Request body must contain valid JSON" };
  }
}

function secondsUntilMinuteReset(rate) {
  const start = rate?.window_start ? new Date(rate.window_start).getTime() : Date.now();
  return Math.max(1, Math.ceil((start + 60_000 - Date.now()) / 1000));
}

function secondsUntilMonthlyReset(monthly) {
  const start = monthly?.month_start
    ? new Date(monthly.month_start + "T00:00:00.000Z")
    : new Date();
  const reset = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0);
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

function context(identity, input = {}) {
  return {
    organization_id: identity.organization_id,
    entity_id: input.entity_id || input.entityId || null,
    period_id: input.period_id || input.periodId || null,
    country: null,
    currency: null,
    locale: null,
    timezone: null,
    permissions: identity.permissions,
    role: identity.role,
    actor_id: null,
    developer_credential_id: identity.credential_id,
    developer_environment: identity.environment?.environment_key || null,
  };
}

async function prepare(request, capabilityId) {
  const requestId = developerRequestId(request);
  const started = Date.now();
  const identity = await resolveDeveloperMachineIdentity(request);
  if (!identity.success) {
    return { requestId, started, failure: response({ ok: false, error: identity.error }, identity.status, requestId) };
  }
  const rate = await claimDeveloperEnvironmentRateLimit(identity).catch(() => null);
  if (!rate) {
    return { requestId, started, identity, failure: response({ ok: false, error: "Developer rate-limit service unavailable" }, 503, requestId) };
  }
  if (!rate.allowed) {
    await recordDeveloperApiRequest({
      requestId, identity, capabilityId, method: request.method,
      statusCode: 429, latencyMs: Date.now() - started, errorCode: "ENVIRONMENT_RATE_LIMIT_EXCEEDED",
    });
    return {
      requestId, started, identity, rate,
      failure: response(
        { ok: false, error: "Rate limit exceeded" },
        429,
        requestId,
        rate,
        identity.environment?.environment_key || null,
        null,
        false,
        secondsUntilMinuteReset(rate),
      ),
    };
  }

  const monthly = await claimDeveloperEnvironmentQuota(identity).catch(() => null);
  if (!monthly) {
    return {
      requestId, started, identity, rate,
      failure: response(
        { ok: false, error: "Developer quota service unavailable" },
        503,
        requestId,
        rate,
        identity.environment?.environment_key || null,
      ),
    };
  }
  if (!monthly.allowed) {
    await recordDeveloperApiRequest({
      requestId, identity, capabilityId, method: request.method,
      statusCode: 429, latencyMs: Date.now() - started, errorCode: "MONTHLY_QUOTA_EXCEEDED",
    });
    return {
      requestId, started, identity, rate, monthly,
      failure: response(
        { ok: false, error: "Monthly developer request quota exceeded" },
        429,
        requestId,
        rate,
        identity.environment?.environment_key || null,
        monthly,
        false,
        secondsUntilMonthlyReset(monthly),
      ),
    };
  }
  return { requestId, started, identity, rate, monthly };
}

async function finish({
  prepared,
  capabilityId,
  method,
  command = null,
  result,
  idempotencyKey = null,
  idempotentReplay = false,
}) {
  const status = Number(result?.status || 500);
  await recordDeveloperApiRequest({
    requestId: prepared.requestId,
    identity: prepared.identity,
    capabilityId,
    method,
    command,
    statusCode: status,
    latencyMs: Date.now() - prepared.started,
    errorCode: status >= 400 ? (result?.body?.error || "REQUEST_FAILED") : null,
    idempotencyKey,
  });
  return response(
    result.body,
    status,
    prepared.requestId,
    prepared.rate,
    prepared.identity?.environment?.environment_key || null,
    prepared.monthly || null,
    idempotentReplay,
  );
}

export async function GET(request, { params }) {
  const resolved = await params;
  const capabilityId = String(resolved?.capabilityId || "").trim();
  const prepared = await prepare(request, capabilityId);
  if (prepared.failure) return prepared.failure;

  const authorization = authorizeOperationsAccess({
    permissions: prepared.identity.permissions,
    capabilityId,
    action: OPERATIONS_ACTIONS.VIEW,
  });
  if (!authorization.allowed) {
    return finish({
      prepared, capabilityId, method: "GET",
      result: { status: 403, body: { ok: false, error: "Capability permission required", authorization, required_permissions: authorization.required_permissions } },
    });
  }
  const { searchParams } = new URL(request.url);
  const input = Object.fromEntries(searchParams.entries());
  const id = input.id || input.record_id;
  const result = id
    ? await serverOperationsApi.detail({ capabilityId, id, context: context(prepared.identity, input) })
    : await serverOperationsApi.list({ capabilityId, context: context(prepared.identity, input), filters: input });
  return finish({ prepared, capabilityId, method: "GET", result });
}

async function mutate(request, params, fallbackCommand, method) {
  const resolved = await params;
  const capabilityId = String(resolved?.capabilityId || "").trim();
  const prepared = await prepare(request, capabilityId);
  if (prepared.failure) return prepared.failure;

  const parsed = await boundedJson(request);
  if (!parsed.success) {
    return finish({
      prepared,
      capabilityId,
      method,
      result: { status: parsed.status, body: { ok: false, error: parsed.error } },
    });
  }
  const body = parsed.body;
  const command = String(body.command || fallbackCommand).trim();

  if (String(prepared.identity?.environment?.environment_key || "").toLowerCase() !== "production") {
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      result: {
        status: 403,
        body: {
          ok: false,
          error: "Development and staging Developer API environments are read-only until an isolated sandbox data plane is configured",
        },
      },
    });
  }

  const authorization = authorizeOperationsAccess({
    permissions: prepared.identity.permissions,
    capabilityId,
    command,
  });
  if (!authorization.allowed) {
    return finish({
      prepared, capabilityId, method, command,
      result: { status: 403, body: { ok: false, error: "Capability permission required", authorization, required_permissions: authorization.required_permissions } },
    });
  }
  const idempotencyKey =
    String(request.headers.get("idempotency-key") || body.idempotency_key || body.idempotencyKey || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      idempotencyKey: idempotencyKey || null,
      result: {
        status: 400,
        body: { ok: false, error: "Idempotency-Key must be between 8 and 200 characters" },
      },
    });
  }

  const executionPayload = { ...body };
  delete executionPayload.command;
  delete executionPayload.idempotency_key;
  delete executionPayload.idempotencyKey;

  const requestHash = developerMutationRequestHash({
    capabilityId,
    command,
    payload: executionPayload,
  });

  let claim;
  try {
    claim = await claimDeveloperApiIdempotency({
      identity: prepared.identity,
      idempotencyKey,
      capabilityId,
      command,
      requestHash,
    });
  } catch {
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      idempotencyKey,
      result: { status: 503, body: { ok: false, error: "Idempotency service unavailable" } },
    });
  }

  if (!claim.matching_request) {
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      idempotencyKey,
      result: {
        status: 409,
        body: { ok: false, error: "Idempotency key was already used for a different request" },
      },
    });
  }

  if (!claim.claimed) {
    if (claim.state === "SETTLED" && claim.response_status !== null) {
      return finish({
        prepared,
        capabilityId,
        method,
        command,
        idempotencyKey,
        idempotentReplay: true,
        result: {
          status: claim.response_status,
          body: claim.response_body || {},
        },
      });
    }
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      idempotencyKey,
      result: {
        status: 409,
        body: { ok: false, error: "A request with this idempotency key is already in progress" },
      },
    });
  }

  const result = await serverOperationsApi.execute({
    capabilityId,
    command,
    context: context(prepared.identity, body),
    payload: {
      ...executionPayload,
      idempotency_key: idempotencyKey,
      developer_credential_id: prepared.identity.credential_id,
    },
  });

  let settled = false;
  try {
    settled = await settleDeveloperApiIdempotency({
      identity: prepared.identity,
      recordId: claim.record_id,
      requestHash,
      responseStatus: Number(result?.status || 500),
      responseBody: result?.body || {},
    });
  } catch {
    settled = false;
  }
  if (!settled) {
    return finish({
      prepared,
      capabilityId,
      method,
      command,
      idempotencyKey,
      result: {
        status: 503,
        body: {
          ok: false,
          error: "Mutation result could not be durably settled; do not retry with a new idempotency key",
        },
      },
    });
  }

  return finish({ prepared, capabilityId, method, command, result, idempotencyKey });
}

export async function POST(request, { params }) {
  return mutate(request, params, "create", "POST");
}
export async function PATCH(request, { params }) {
  return mutate(request, params, "update", "PATCH");
}
