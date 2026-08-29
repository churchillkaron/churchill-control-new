const CONTROLLER_CONTRACT = "AVANTIQO_VOICE_REALTIME_SAFE_LEASE_V1";
const DISTRIBUTED_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "voice-stt";
const CANONICAL_ENDPOINT_NAME = "avantiqo-voice-stt-realtime-v1";
const CANONICAL_ENDPOINT_TYPE = "LOAD_BALANCER";
const CANONICAL_GPU_POOL = "AMPERE_16";
const CANONICAL_GPU_COUNT = 1;
const CANONICAL_IDLE_TIMEOUT_SECONDS = 5;
const REST_BASE = "https://api.runpod.io/v2";
const DEFAULT_TTL_SECONDS = 120;
const CLEANUP_TIMEOUT_MS = 180_000;
const WATCHDOG_POLL_MS = 5_000;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function finite(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function supabaseSecretKey(): string {
  const raw = text(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = text(parsed?.default);
      if (key) return key;
    } catch {
      throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_SUPABASE_SECRET_KEYS_INVALID");
    }
  }

  const localKey = text(Deno.env.get("SUPABASE_SECRET_KEY"));
  if (localKey) return localKey;

  const legacyKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (legacyKey) return legacyKey;

  throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_SUPABASE_SECRET_REQUIRED");
}

function isLegacyJwtKey(value: string): boolean {
  const parts = value.split(".");
  return value.startsWith("eyJ") && parts.length === 3 && parts.every(Boolean);
}

function supabaseRpcHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    "Cache-Control": "no-store",
    ...(isLegacyJwtKey(key) ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function supabaseUrl(): string {
  const value = text(Deno.env.get("SUPABASE_URL"));
  if (!value) throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_SUPABASE_URL_REQUIRED");
  return value.replace(/\/+$/, "");
}

function runpodManagementKey(): string {
  const value = text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_MANAGEMENT_API_KEY"));
  if (!value) {
    throw new Error("AVANTIQO_VOICE_REALTIME_RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  }
  return value;
}

function configuredEndpointName(): string {
  const value = text(Deno.env.get("AVANTIQO_VOICE_REALTIME_RUNPOD_ENDPOINT_NAME"));
  if (value !== CANONICAL_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_ENDPOINT_NAME_INVALID");
  }
  return value;
}

async function requestJson(
  url: string,
  options: { method?: string; headers?: HeadersInit; body?: unknown; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`AVANTIQO_VOICE_REALTIME_SAFE_LEASE_HTTP_${response.status}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_RESPONSE_INVALID");
  }

  return parsed as Record<string, unknown>;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = supabaseSecretKey();
  return requestJson(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: supabaseRpcHeaders(key),
    body,
  });
}

function endpointUrl(endpointId: string): string {
  return `${REST_BASE}/serverless/${encodeURIComponent(endpointId)}`;
}

function endpointWorkersUrl(endpointId: string): string {
  return `${endpointUrl(endpointId)}/workers`;
}

function runpodHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${runpodManagementKey()}` };
}

async function getEndpoint(endpointId: string): Promise<Record<string, unknown>> {
  return requestJson(endpointUrl(endpointId), {
    headers: runpodHeaders(),
  });
}

async function getEndpointWorkers(endpointId: string): Promise<Record<string, unknown>> {
  return requestJson(endpointWorkersUrl(endpointId), {
    headers: runpodHeaders(),
  });
}

type EndpointState = {
  endpoint: Record<string, unknown>;
  workerInventory: Record<string, unknown>;
};

async function getEndpointState(endpointId: string): Promise<EndpointState> {
  const [endpoint, workerInventory] = await Promise.all([
    getEndpoint(endpointId),
    getEndpointWorkers(endpointId),
  ]);
  return { endpoint, workerInventory };
}

async function patchEndpointWorkers(
  endpointId: string,
  workersMax: 0 | 1,
): Promise<EndpointState> {
  await requestJson(endpointUrl(endpointId), {
    method: "PATCH",
    headers: runpodHeaders(),
    body: {
      workers: {
        min: 0,
        max: workersMax,
        idleTimeout: CANONICAL_IDLE_TIMEOUT_SECONDS,
      },
    },
  });
  return getEndpointState(endpointId);
}

function endpointWorkerBounds(endpoint: Record<string, unknown>): {
  min: number | null;
  max: number | null;
  idleTimeout: number | null;
} {
  const config = record(endpoint.workers);
  return {
    min: finite(config.min),
    max: finite(config.max),
    idleTimeout: finite(config.idleTimeout),
  };
}

function activeWorkers(workerInventory: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(workerInventory.workers)
    ? workerInventory.workers.filter((worker) => worker && typeof worker === "object") as Record<string, unknown>[]
    : [];
}

function assertEndpointIdentity(endpoint: Record<string, unknown>, endpointId: string): void {
  if (text(endpoint.id) !== endpointId || text(endpoint.name) !== configuredEndpointName()) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_ENDPOINT_IDENTITY_INVALID");
  }
  if (text(endpoint.type) !== CANONICAL_ENDPOINT_TYPE) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_ENDPOINT_TYPE_INVALID");
  }

  const scaling = record(endpoint.scaling);
  if (text(scaling.type) !== "REQUEST_COUNT") {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_SCALER_INVALID");
  }

  const gpu = record(endpoint.gpu);
  const pools = Array.isArray(gpu.pools) ? gpu.pools.map(text).filter(Boolean) : [];
  if (
    pools.length !== 1 ||
    pools[0] !== CANONICAL_GPU_POOL ||
    finite(gpu.count, -1) !== CANONICAL_GPU_COUNT
  ) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_GPU_CONFIG_INVALID");
  }
}

function assertWorkerInventory(workerInventory: Record<string, unknown>): void {
  const rows = activeWorkers(workerInventory);
  const summary = record(workerInventory.summary);
  const total = finite(summary.total);
  if (total !== null && total !== rows.length) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_WORKER_INVENTORY_INCONSISTENT");
  }
}

function assertRestingEndpoint(state: EndpointState, endpointId: string): void {
  assertEndpointIdentity(state.endpoint, endpointId);
  assertWorkerInventory(state.workerInventory);
  const bounds = endpointWorkerBounds(state.endpoint);
  if (
    bounds.min !== 0 ||
    bounds.max !== 0 ||
    bounds.idleTimeout !== CANONICAL_IDLE_TIMEOUT_SECONDS
  ) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_REST_STATE_REQUIRED");
  }
  if (activeWorkers(state.workerInventory).length !== 0) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_REST_WORKER_PRESENT");
  }
}

function assertOpenEndpoint(state: EndpointState, endpointId: string): void {
  assertEndpointIdentity(state.endpoint, endpointId);
  assertWorkerInventory(state.workerInventory);
  const bounds = endpointWorkerBounds(state.endpoint);
  if (
    bounds.min !== 0 ||
    bounds.max !== 1 ||
    bounds.idleTimeout !== CANONICAL_IDLE_TIMEOUT_SECONDS
  ) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_OPEN_STATE_INVALID");
  }
  if (activeWorkers(state.workerInventory).length > 1) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_WORKER_LIMIT");
  }
}

async function releaseDistributedLease({
  leaseId,
  ownerRequestId,
  state,
  reason,
}: {
  leaseId: string;
  ownerRequestId: string;
  state: "RELEASED" | "FAILED" | "EXPIRED";
  reason: string | null;
}): Promise<void> {
  await rpc("release_avantiqo_voice_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_state: state,
    p_reason: reason,
  });
}

async function parkAndVerify(endpointId: string): Promise<Record<string, unknown>> {
  await patchEndpointWorkers(endpointId, 0);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = await getEndpointState(endpointId);

  while (Date.now() < deadline) {
    assertEndpointIdentity(latest.endpoint, endpointId);
    assertWorkerInventory(latest.workerInventory);
    const bounds = endpointWorkerBounds(latest.endpoint);
    if (
      bounds.min === 0 &&
      bounds.max === 0 &&
      bounds.idleTimeout === CANONICAL_IDLE_TIMEOUT_SECONDS &&
      activeWorkers(latest.workerInventory).length === 0
    ) {
      return latest.endpoint;
    }
    await new Promise((resolve) => setTimeout(resolve, WATCHDOG_POLL_MS));
    latest = await getEndpointState(endpointId);
  }

  throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_CLEANUP_TIMEOUT");
}

export function realtimeEndpointIdFromWebSocketUrl(raw: string): string {
  const url = new URL(text(raw));
  if (
    url.protocol !== "wss:" ||
    url.pathname !== "/v1/realtime/transcribe" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_WS_URL_INVALID");
  }

  const match = url.hostname.match(/^([A-Za-z0-9_-]+)\.api\.runpod\.ai$/);
  const endpointId = text(match?.[1]);
  if (!endpointId) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_ENDPOINT_ID_REQUIRED");
  }
  return endpointId;
}

export function voiceRealtimeSafeLeaseCertification() {
  return {
    contract: CONTROLLER_CONTRACT,
    distributed_contract: DISTRIBUTED_CONTRACT,
    lane: LANE,
    endpoint_name: CANONICAL_ENDPOINT_NAME,
    endpoint_type: CANONICAL_ENDPOINT_TYPE,
    runpod_control_api: "v2",
    worker_inventory_api: "/v2/serverless/{id}/workers",
    gpu_pool: CANONICAL_GPU_POOL,
    gpu_count: CANONICAL_GPU_COUNT,
    scaler_type: "REQUEST_COUNT",
    resting_workers_min: 0,
    resting_workers_max: 0,
    leased_workers_min: 0,
    leased_workers_max: 1,
    max_active_workers: 1,
    queue_api_allowed: false,
    purge_queue_allowed: false,
    direct_run_allowed: false,
    source_only: true,
    realtime_streaming_certified: false,
    production_deploy_performed: false,
    gpu_started: false,
    generation_submitted: false,
  };
}

export async function acquireVoiceRealtimeSafeLease({
  organizationId,
  endpointId,
  ownerRequestId,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: {
  organizationId: string;
  endpointId: string;
  ownerRequestId: string;
  ttlSeconds?: number;
}) {
  const resolvedOrganizationId = text(organizationId);
  const resolvedEndpointId = text(endpointId);
  const resolvedOwnerRequestId = text(ownerRequestId);
  if (!resolvedOrganizationId || !resolvedEndpointId || !resolvedOwnerRequestId) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_INPUT_REQUIRED");
  }

  const resting = await getEndpointState(resolvedEndpointId);
  assertRestingEndpoint(resting, resolvedEndpointId);

  const lease = await rpc("acquire_avantiqo_voice_runpod_lease_v2", {
    p_organization_id: resolvedOrganizationId,
    p_lane: LANE,
    p_endpoint_id: resolvedEndpointId,
    p_endpoint_name: configuredEndpointName(),
    p_owner_request_id: resolvedOwnerRequestId,
    p_ttl_seconds: Math.max(60, Math.min(1800, Math.floor(ttlSeconds))),
  });

  const leaseId = text(lease.id);
  if (
    !leaseId ||
    text(lease.contract) !== DISTRIBUTED_CONTRACT ||
    text(lease.state) !== "ACTIVE" ||
    text(lease.endpoint_id) !== resolvedEndpointId
  ) {
    throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_DISTRIBUTED_ACQUIRE_INVALID");
  }

  let endpointOpened = false;
  try {
    const rechecked = await getEndpointState(resolvedEndpointId);
    assertRestingEndpoint(rechecked, resolvedEndpointId);

    endpointOpened = true;
    const opened = await patchEndpointWorkers(resolvedEndpointId, 1);
    assertOpenEndpoint(opened, resolvedEndpointId);

    let released = false;
    return {
      contract: CONTROLLER_CONTRACT,
      leaseId,
      endpointId: resolvedEndpointId,
      ownerRequestId: resolvedOwnerRequestId,
      async refresh() {
        if (released) throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_ALREADY_RELEASED");
        const current = await getEndpointState(resolvedEndpointId);
        assertOpenEndpoint(current, resolvedEndpointId);
        const refreshed = await rpc("refresh_avantiqo_voice_runpod_lease_v2", {
          p_lease_id: leaseId,
          p_owner_request_id: resolvedOwnerRequestId,
          p_ttl_seconds: Math.max(60, Math.min(1800, Math.floor(ttlSeconds))),
        });
        if (text(refreshed.id) !== leaseId || text(refreshed.state) !== "ACTIVE") {
          throw new Error("AVANTIQO_VOICE_REALTIME_SAFE_LEASE_REFRESH_INVALID");
        }
        return current.endpoint;
      },
      async release(reason = "REALTIME_SESSION_COMPLETE") {
        if (released) return;
        released = true;
        await parkAndVerify(resolvedEndpointId);
        await releaseDistributedLease({
          leaseId,
          ownerRequestId: resolvedOwnerRequestId,
          state: "RELEASED",
          reason,
        });
      },
      async fail(reason = "REALTIME_SESSION_FAILED") {
        if (released) return;
        released = true;
        await parkAndVerify(resolvedEndpointId);
        await releaseDistributedLease({
          leaseId,
          ownerRequestId: resolvedOwnerRequestId,
          state: "FAILED",
          reason,
        });
      },
    };
  } catch (error) {
    if (endpointOpened) {
      await parkAndVerify(resolvedEndpointId).catch(() => null);
    }
    await releaseDistributedLease({
      leaseId,
      ownerRequestId: resolvedOwnerRequestId,
      state: "FAILED",
      reason: text(error instanceof Error ? error.message : error).slice(0, 200) || "ACQUIRE_FAILED",
    }).catch(() => null);
    throw error;
  }
}
