import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT =
  "AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const TABLE = "avantiqo_intelligence_runpod_leases";
const LANE = "intelligence-experiment";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function requiredOrganizationId() {
  const id = learningOrganizationId();
  if (!id) throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  return id;
}

function uuid(value, code) {
  const candidate = text(value, 80).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

function endpoint(value, code) {
  const candidate = text(value, 200);
  if (!candidate || !/^[A-Za-z0-9_.:-]+$/.test(candidate)) {
    throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

function ttlSeconds(value) {
  const number = Number(value ?? 900);
  if (!Number.isFinite(number)) return 900;
  return Math.max(60, Math.min(1800, Math.floor(number)));
}

function fingerprint(row) {
  return createHash("sha256")
    .update([
      row.contract,
      row.safe_lease_contract,
      row.organization_id,
      row.id,
      row.owner_request_id,
      row.lane,
      row.endpoint_id,
      row.endpoint_name,
      row.acquired_at,
      row.expires_at,
    ].map((part) => text(part, 4000).toLowerCase()).join("|"))
    .digest("hex");
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    lease_fingerprint: fingerprint(row),
    db_persisted: true,
    authorization_effect: "NONE",
  };
}

export async function acquireAvantiqoIntelligenceRunpodLease({
  endpoint_id,
  endpoint_name,
  owner_request_id,
  ttl_seconds = 900,
} = {}) {
  const organizationId = requiredOrganizationId();
  const result = await supabaseAdmin.rpc("acquire_avantiqo_intelligence_runpod_lease_v1", {
    p_organization_id: organizationId,
    p_endpoint_id: endpoint(endpoint_id, "ENDPOINT_ID"),
    p_endpoint_name: text(endpoint_name, 200),
    p_owner_request_id: uuid(owner_request_id, "OWNER_REQUEST_ID"),
    p_ttl_seconds: ttlSeconds(ttl_seconds),
  });
  if (result.error) throw result.error;
  const lease = normalize(result.data);
  if (!lease || lease.contract !== AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT || lease.state !== "ACTIVE") {
    throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_ACQUIRE_INVALID`);
  }
  return lease;
}

export async function refreshAvantiqoIntelligenceRunpodLease({
  lease_id,
  owner_request_id,
  ttl_seconds = 900,
} = {}) {
  const result = await supabaseAdmin.rpc("refresh_avantiqo_intelligence_runpod_lease_v1", {
    p_lease_id: uuid(lease_id, "LEASE_ID"),
    p_owner_request_id: uuid(owner_request_id, "OWNER_REQUEST_ID"),
    p_ttl_seconds: ttlSeconds(ttl_seconds),
  });
  if (result.error) throw result.error;
  const lease = normalize(result.data);
  if (!lease || lease.state !== "ACTIVE") {
    throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_REFRESH_INVALID`);
  }
  return lease;
}

export async function releaseAvantiqoIntelligenceRunpodLease({
  lease_id,
  owner_request_id,
  state = "RELEASED",
  reason = null,
} = {}) {
  const normalizedState = text(state, 40).toUpperCase();
  if (!["RELEASED", "FAILED", "EXPIRED"].includes(normalizedState)) {
    throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_RELEASE_STATE_INVALID`);
  }
  const result = await supabaseAdmin.rpc("release_avantiqo_intelligence_runpod_lease_v1", {
    p_lease_id: uuid(lease_id, "LEASE_ID"),
    p_owner_request_id: uuid(owner_request_id, "OWNER_REQUEST_ID"),
    p_state: normalizedState,
    p_reason: text(reason, 500) || null,
  });
  if (result.error) throw result.error;
  return normalize(result.data);
}

export async function assertAvantiqoIntelligenceRunpodLeaseCurrent({
  lease_id,
  endpoint_id = null,
  owner_request_id = null,
} = {}) {
  const organizationId = requiredOrganizationId();
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", uuid(lease_id, "LEASE_ID"))
    .eq("organization_id", organizationId)
    .eq("contract", AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT)
    .eq("safe_lease_contract", SAFE_LEASE_CONTRACT)
    .eq("lane", LANE)
    .eq("state", "ACTIVE")
    .gt("expires_at", new Date().toISOString());
  if (endpoint_id) query = query.eq("endpoint_id", endpoint(endpoint_id, "ENDPOINT_ID"));
  if (owner_request_id) query = query.eq("owner_request_id", uuid(owner_request_id, "OWNER_REQUEST_ID"));
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error(`${AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT}_ACTIVE_LEASE_NOT_FOUND`);
  return normalize(result.data);
}

export const AvantiqoIntelligenceRunpodLeaseRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT,
  safeLeaseContract: SAFE_LEASE_CONTRACT,
  lane: LANE,
  acquire: acquireAvantiqoIntelligenceRunpodLease,
  refresh: refreshAvantiqoIntelligenceRunpodLease,
  release: releaseAvantiqoIntelligenceRunpodLease,
  assertCurrent: assertAvantiqoIntelligenceRunpodLeaseCurrent,
  providerCalledHere: false,
  walletWrittenHere: false,
  runpodJobSubmittedHere: false,
  platformKnowledgeWrittenHere: false,
  automaticTrainingStartedHere: false,
});
