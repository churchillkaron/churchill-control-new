import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CODE_AI_OWNER_INTERVENTION_CONTRACT =
  "AVANTIQO_CODE_AI_OWNER_INTERVENTION_V1";
export const CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT =
  "AVANTIQO_CODE_AI_OWNER_INTERVENTION_LIFECYCLE_V2";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_owner_intervention";
const MEMORY_SOURCE = "code_ai_owner_intervention_runtime";
const MAX_INSTRUCTION_CHARS = 2000;
const MAX_QUERY_ROWS = 120;
const DEFAULT_CLAIM_LEASE_MS = 10 * 60 * 1000;
const MIN_CLAIM_LEASE_MS = 30 * 1000;
const MAX_CLAIM_LEASE_MS = 30 * 60 * 1000;
const INTERVENTION_ACTIONS = new Set(["STEER", "REQUEST_CHANGES"]);
const REVIEW_ACTIONS = new Set(["APPROVE_PATCH", "REQUEST_CHANGES"]);
const ALL_ACTIONS = new Set([...INTERVENTION_ACTIONS, ...REVIEW_ACTIONS]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function time(value) {
  const parsed = Date.parse(text(value, 120));
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedLeaseMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CLAIM_LEASE_MS;
  return Math.min(MAX_CLAIM_LEASE_MS, Math.max(MIN_CLAIM_LEASE_MS, Math.floor(parsed)));
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function normalizedAction(value) {
  const action = text(value, 80).toUpperCase();
  if (!ALL_ACTIONS.has(action)) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_ACTION_INVALID");
  }
  return action;
}

function normalizedMissionId(value) {
  const missionId = text(value, 240);
  if (!missionId) throw new Error("CODE_AI_OWNER_INTERVENTION_MISSION_REQUIRED");
  return missionId;
}

function memoryKey(actor, missionId) {
  const nonce = crypto.randomUUID();
  const digest = crypto
    .createHash("sha256")
    .update(`${actor}:${missionId}:${nonce}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `code_ai_owner_intervention:v1:${digest}`;
}

function projection(row = {}) {
  const metadata = object(row.metadata);
  return {
    id: row.id || null,
    contract: text(metadata.contract, 180) || CODE_AI_OWNER_INTERVENTION_CONTRACT,
    lifecycle_contract:
      text(metadata.lifecycle_contract, 180) || CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
    action: text(metadata.action, 80) || null,
    mission_id: text(metadata.mission_id, 240) || null,
    instruction: text(metadata.instruction, MAX_INSTRUCTION_CHARS) || null,
    status: text(metadata.status, 80) || null,
    consume_at_safe_boundary: metadata.consume_at_safe_boundary === true,
    submitted_at: text(metadata.submitted_at, 120) || row.created_at || null,
    claim_id: text(metadata.claim_id, 120) || null,
    claimed_at: text(metadata.claimed_at, 120) || null,
    claim_expires_at: text(metadata.claim_expires_at, 120) || null,
    applied_at: text(metadata.applied_at, 120) || null,
    applied_reasoning_package_at:
      text(metadata.applied_reasoning_package_at, 120) || null,
    applied_reasoning_call:
      Number.isInteger(Number(metadata.applied_reasoning_call))
        ? Number(metadata.applied_reasoning_call)
        : null,
    updated_at: row.updated_at || null,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

async function scopedRows({ context, missionId, active = null } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const mission = normalizedMissionId(missionId);
  if (!orgId) throw new Error("CODE_AI_OWNER_INTERVENTION_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_OWNER_INTERVENTION_ACTOR_REQUIRED");

  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,active,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .order("created_at", { ascending: false })
    .limit(MAX_QUERY_ROWS);
  if (active === true || active === false) query = query.eq("active", active);
  const result = await query;
  if (result.error) throw result.error;

  return (result.data || []).filter((row) => {
    const metadata = object(row.metadata);
    return (
      text(metadata.actor_id, 160) === actor &&
      text(metadata.mission_id, 240) === mission &&
      text(metadata.contract, 180) === CODE_AI_OWNER_INTERVENTION_CONTRACT
    );
  });
}

async function compareAndSetActiveRow(row, values) {
  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .update(values)
    .eq("id", row.id)
    .eq("active", true);
  if (row.updated_at) query = query.eq("updated_at", row.updated_at);
  const result = await query
    .select("id,metadata,active,created_at,updated_at")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function recoverExpiredClaims(rows = []) {
  let recovered = false;
  const nowMs = Date.now();
  for (const row of rows) {
    const metadata = object(row.metadata);
    if (text(metadata.status, 80) !== "CLAIMED") continue;
    const expiresAt = time(metadata.claim_expires_at);
    if (expiresAt > nowMs) continue;

    const recoveredAt = new Date().toISOString();
    const data = await compareAndSetActiveRow(row, {
      active: true,
      metadata: {
        ...metadata,
        lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
        status: "PENDING",
        last_claim_id: text(metadata.claim_id, 120) || null,
        last_claimed_at: text(metadata.claimed_at, 120) || null,
        last_release_reason: "CLAIM_LEASE_EXPIRED",
        recovered_at: recoveredAt,
        claim_id: null,
        claimed_at: null,
        claim_expires_at: null,
        applied_at: null,
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
      },
      updated_at: recoveredAt,
    });
    if (data?.id) recovered = true;
  }
  return recovered;
}

export async function submitCodeAIOwnerControl({
  context = {},
  missionId,
  action,
  instruction = null,
  consumeAtSafeBoundary = false,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const mission = normalizedMissionId(missionId);
  const controlAction = normalizedAction(action);
  const boundedInstruction = text(instruction, MAX_INSTRUCTION_CHARS) || null;
  if (!orgId) throw new Error("CODE_AI_OWNER_INTERVENTION_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_OWNER_INTERVENTION_ACTOR_REQUIRED");
  if (controlAction !== "APPROVE_PATCH" && !boundedInstruction) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_INSTRUCTION_REQUIRED");
  }
  if (consumeAtSafeBoundary && !INTERVENTION_ACTIONS.has(controlAction)) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_ACTION_NOT_CONSUMABLE");
  }

  const now = new Date().toISOString();
  const status = consumeAtSafeBoundary ? "PENDING" : "RECORDED";
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert({
      organization_id: orgId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey(actor, mission),
      memory_type: "fact",
      subject: "Code AI Owner Intervention",
      content: `Owner Code control recorded for mission ${mission}. Action: ${controlAction}.`,
      importance: 0.05,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
        lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
        actor_id: actor,
        mission_id: mission,
        action: controlAction,
        instruction: boundedInstruction,
        status,
        consume_at_safe_boundary: consumeAtSafeBoundary === true,
        submitted_at: now,
        claim_id: null,
        claimed_at: null,
        claim_expires_at: null,
        applied_at: null,
        applied_reasoning_package_at: null,
        applied_reasoning_call: null,
        ordinary_memory_recall: false,
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
      },
      updated_at: now,
    })
    .select("id,metadata,active,created_at,updated_at")
    .single();
  if (result.error) throw result.error;

  return {
    recorded: true,
    control: projection(result.data),
  };
}

export async function claimPendingCodeAIOwnerIntervention({
  context = {},
  missionId,
  existingClaimId = null,
  leaseMs = DEFAULT_CLAIM_LEASE_MS,
} = {}) {
  const duration = boundedLeaseMs(leaseMs);
  let rows = await scopedRows({ context, missionId, active: true });
  const requestedClaimId = text(existingClaimId, 120);

  if (requestedClaimId) {
    const existing = rows.find((row) => {
      const metadata = object(row.metadata);
      return (
        text(metadata.status, 80) === "CLAIMED" &&
        text(metadata.claim_id, 120) === requestedClaimId &&
        metadata.consume_at_safe_boundary === true
      );
    });
    if (existing && time(existing?.metadata?.claim_expires_at) > Date.now()) {
      const renewedAt = new Date().toISOString();
      const renewed = await compareAndSetActiveRow(existing, {
        active: true,
        metadata: {
          ...object(existing.metadata),
          lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
          claim_expires_at: new Date(Date.now() + duration).toISOString(),
          last_lease_renewed_at: renewedAt,
          authorization_effect: "NONE",
          commit_authority: false,
          production_deploy_authority: false,
        },
        updated_at: renewedAt,
      });
      if (renewed?.id) {
        return {
          claimed: true,
          resumed: true,
          intervention: projection(renewed),
        };
      }
    }
  }

  if (await recoverExpiredClaims(rows)) {
    rows = await scopedRows({ context, missionId, active: true });
  }

  const activeClaim = rows.find((row) => {
    const metadata = object(row.metadata);
    return (
      text(metadata.status, 80) === "CLAIMED" &&
      time(metadata.claim_expires_at) > Date.now()
    );
  });
  if (activeClaim?.id) {
    return {
      claimed: false,
      resumed: false,
      blocked_by_existing_claim: true,
      intervention: null,
    };
  }

  const pending = [...rows]
    .reverse()
    .find((row) => {
      const metadata = object(row.metadata);
      return (
        text(metadata.status, 80) === "PENDING" &&
        metadata.consume_at_safe_boundary === true &&
        INTERVENTION_ACTIONS.has(text(metadata.action, 80))
      );
    });
  if (!pending?.id) return { claimed: false, resumed: false, intervention: null };

  const metadata = object(pending.metadata);
  const claimedAt = new Date().toISOString();
  const claimId = crypto.randomUUID();
  const result = await compareAndSetActiveRow(pending, {
    active: true,
    metadata: {
      ...metadata,
      lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      status: "CLAIMED",
      claim_id: claimId,
      claimed_at: claimedAt,
      claim_expires_at: new Date(Date.now() + duration).toISOString(),
      applied_at: null,
      applied_reasoning_package_at: null,
      applied_reasoning_call: null,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    },
    updated_at: claimedAt,
  });
  if (!result?.id) return { claimed: false, resumed: false, intervention: null };

  return {
    claimed: true,
    resumed: false,
    intervention: projection(result),
  };
}

export async function applyClaimedCodeAIOwnerIntervention({
  context = {},
  missionId,
  interventionId,
  claimId,
  reasoningPackage = null,
} = {}) {
  const intervention = text(interventionId, 160);
  const claim = text(claimId, 120);
  const packageEvidence = object(reasoningPackage);
  if (!intervention || !claim) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_CLAIM_IDENTITY_REQUIRED");
  }
  if (text(packageEvidence.kind, 120) !== "batched_reasoning_package") {
    throw new Error("CODE_AI_OWNER_INTERVENTION_FRESH_REASONING_PACKAGE_REQUIRED");
  }
  const packageAt = text(packageEvidence.at, 120);
  const reasoningCall = Number(packageEvidence.reasoning_call);
  if (!time(packageAt) || !Number.isInteger(reasoningCall) || reasoningCall < 1) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_REASONING_PACKAGE_EVIDENCE_INVALID");
  }

  const rows = await scopedRows({ context, missionId, active: true });
  const row = rows.find((candidate) => {
    const metadata = object(candidate.metadata);
    return (
      String(candidate.id) === intervention &&
      text(metadata.status, 80) === "CLAIMED" &&
      text(metadata.claim_id, 120) === claim
    );
  });
  if (!row?.id) return { applied: false, intervention: null };
  if (time(packageAt) < time(row?.metadata?.claimed_at)) {
    throw new Error("CODE_AI_OWNER_INTERVENTION_REASONING_PACKAGE_STALE");
  }

  const metadata = object(row.metadata);
  const appliedAt = new Date().toISOString();
  const result = await compareAndSetActiveRow(row, {
    active: false,
    metadata: {
      ...metadata,
      lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      status: "APPLIED",
      applied_at: appliedAt,
      applied_reasoning_package_at: packageAt,
      applied_reasoning_call: reasoningCall,
      applied_claim_id: claim,
      claim_expires_at: null,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    },
    updated_at: appliedAt,
  });
  if (!result?.id) return { applied: false, intervention: null };

  return {
    applied: true,
    intervention: projection(result),
  };
}

export async function releaseClaimedCodeAIOwnerIntervention({
  context = {},
  missionId,
  interventionId,
  claimId,
  reason = "FRESH_REASONING_PACKAGE_NOT_PRODUCED",
} = {}) {
  const intervention = text(interventionId, 160);
  const claim = text(claimId, 120);
  if (!intervention || !claim) return { released: false, intervention: null };

  const rows = await scopedRows({ context, missionId, active: true });
  const row = rows.find((candidate) => {
    const metadata = object(candidate.metadata);
    return (
      String(candidate.id) === intervention &&
      text(metadata.status, 80) === "CLAIMED" &&
      text(metadata.claim_id, 120) === claim
    );
  });
  if (!row?.id) return { released: false, intervention: null };

  const metadata = object(row.metadata);
  const releasedAt = new Date().toISOString();
  const result = await compareAndSetActiveRow(row, {
    active: true,
    metadata: {
      ...metadata,
      lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
      status: "PENDING",
      last_claim_id: claim,
      last_claimed_at: text(metadata.claimed_at, 120) || null,
      last_release_reason: text(reason, 300) || "FRESH_REASONING_PACKAGE_NOT_PRODUCED",
      released_at: releasedAt,
      claim_id: null,
      claimed_at: null,
      claim_expires_at: null,
      applied_at: null,
      applied_reasoning_package_at: null,
      applied_reasoning_call: null,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    },
    updated_at: releasedAt,
  });
  if (!result?.id) return { released: false, intervention: null };

  return {
    released: true,
    intervention: projection(result),
  };
}

export async function loadCodeAIOwnerControlState({
  context = {},
  missionId,
} = {}) {
  const rows = await scopedRows({ context, missionId });
  const projected = rows.map(projection);
  const pending = projected.find((item) => item.status === "PENDING") || null;
  const claimed = projected.find((item) => item.status === "CLAIMED") || null;
  const lastApplied = projected.find((item) => item.status === "APPLIED") || null;
  const review = projected.find(
    (item) => item.status === "RECORDED" && REVIEW_ACTIONS.has(item.action),
  ) || null;

  return {
    contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
    lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
    mission_id: normalizedMissionId(missionId),
    pending_intervention: pending,
    claimed_intervention: claimed,
    last_applied_intervention: lastApplied,
    latest_review: review,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

export const CodeAIOwnerInterventionRuntime = Object.freeze({
  contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
  lifecycle_contract: CODE_AI_OWNER_INTERVENTION_LIFECYCLE_CONTRACT,
  submit: submitCodeAIOwnerControl,
  claim: claimPendingCodeAIOwnerIntervention,
  apply: applyClaimedCodeAIOwnerIntervention,
  release: releaseClaimedCodeAIOwnerIntervention,
  load: loadCodeAIOwnerControlState,
  intervention_actions: Object.freeze([...INTERVENTION_ACTIONS]),
  review_actions: Object.freeze([...REVIEW_ACTIONS]),
  claim_lease_ms: DEFAULT_CLAIM_LEASE_MS,
  pending_claimed_applied_lifecycle: true,
  expired_claim_recovery: true,
  applied_requires_fresh_reasoning_package: true,
  authorization_effect: "NONE",
  commit_authority: false,
  production_deploy_authority: false,
});

export default CodeAIOwnerInterventionRuntime;
