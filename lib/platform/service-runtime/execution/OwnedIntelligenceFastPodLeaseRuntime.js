import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_POD_DISTRIBUTED_LEASE_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const LANE = "intelligence-fast";
const REST_BASE = "https://rest.runpod.io/v1";

function text(value) {
  return String(value ?? "").trim();
}

function safeDatabaseReason(error = {}) {
  const source = text(error?.message || error?.details || error?.hint).toUpperCase();
  const match = source.match(/AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_[A-Z0-9_]+/);
  return match?.[0] || null;
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY) || text(process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_MANAGEMENT_KEY_REQUIRED");
  return key;
}

async function endpointId() {
  const response = await fetch(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`, {
    headers: {
      Authorization: `Bearer ${managementKey()}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ENDPOINT_HTTP_${response.status}`);
  }
  const rows = Array.isArray(body)
    ? body
    : body?.endpoints || body?.data || body?.items || body?.results || [];
  const matches = rows.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  const id = text(matches[0]?.id);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ENDPOINT_ID_INVALID");
  }
  return id;
}

async function acquire({ organizationId, endpointId, ownerRequestId }) {
  const { data, error } = await supabaseAdmin.rpc(
    "acquire_avantiqo_intelligence_runpod_lease_v2",
    {
      p_organization_id: organizationId,
      p_lane: LANE,
      p_endpoint_id: endpointId,
      p_endpoint_name: ENDPOINT_NAME,
      p_owner_request_id: ownerRequestId,
      p_ttl_seconds: 1800,
    },
  );
  if (error) {
    const reason = safeDatabaseReason(error);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ACQUIRE_FAILED:${reason || error.code || "UNKNOWN"}`,
    );
  }
  if (
    !data ||
    text(data.state) !== "ACTIVE" ||
    text(data.endpoint_id) !== endpointId ||
    text(data.lane) !== LANE
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ACQUIRE_INVALID");
  }
  return data;
}

async function release({ leaseId, ownerRequestId, state, reason }) {
  const { error } = await supabaseAdmin.rpc(
    "release_avantiqo_intelligence_runpod_lease_v2",
    {
      p_lease_id: leaseId,
      p_owner_request_id: ownerRequestId,
      p_state: state,
      p_reason: reason,
    },
  );
  if (error) {
    const databaseReason = safeDatabaseReason(error);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_RELEASE_FAILED:${databaseReason || error.code || "UNKNOWN"}`,
    );
  }
}

export async function withOwnedIntelligenceFastPodDistributedLease({
  organizationId,
  execute,
} = {}) {
  const orgId = text(organizationId);
  if (!orgId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ORGANIZATION_REQUIRED");
  if (typeof execute !== "function") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_EXECUTOR_REQUIRED");
  }

  const id = await endpointId();
  const ownerRequestId = randomUUID();
  const lease = await acquire({ organizationId: orgId, endpointId: id, ownerRequestId });
  let executionError = null;
  try {
    return await execute({
      intelligence_fast_pod_distributed_lease_contract: CONTRACT,
      intelligence_fast_pod_distributed_lease_id: text(lease.id),
      intelligence_fast_pod_distributed_lease_endpoint_id: id,
      intelligence_fast_pod_distributed_lease_expires_at: text(lease.expires_at),
    });
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    await release({
      leaseId: text(lease.id),
      ownerRequestId,
      state: executionError ? "FAILED" : "RELEASED",
      reason: executionError
        ? "FAST_POD_FALLBACK_FAILED"
        : "FAST_POD_FALLBACK_COMPLETE",
    });
  }
}

export const OwnedIntelligenceFastPodLeaseRuntime = Object.freeze({
  contract: CONTRACT,
  lane: LANE,
  endpointName: ENDPOINT_NAME,
  withLease: withOwnedIntelligenceFastPodDistributedLease,
});

export default OwnedIntelligenceFastPodLeaseRuntime;
