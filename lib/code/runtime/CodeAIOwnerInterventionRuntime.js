import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CODE_AI_OWNER_INTERVENTION_CONTRACT =
  "AVANTIQO_CODE_AI_OWNER_INTERVENTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_owner_intervention";
const MEMORY_SOURCE = "code_ai_owner_intervention_runtime";
const MAX_INSTRUCTION_CHARS = 2000;
const MAX_QUERY_ROWS = 120;
const INTERVENTION_ACTIONS = new Set(["STEER", "REQUEST_CHANGES"]);
const REVIEW_ACTIONS = new Set(["APPROVE_PATCH", "REQUEST_CHANGES"]);
const ALL_ACTIONS = new Set([...INTERVENTION_ACTIONS, ...REVIEW_ACTIONS]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    action: text(metadata.action, 80) || null,
    mission_id: text(metadata.mission_id, 240) || null,
    instruction: text(metadata.instruction, MAX_INSTRUCTION_CHARS) || null,
    status: text(metadata.status, 80) || null,
    consume_at_safe_boundary: metadata.consume_at_safe_boundary === true,
    submitted_at: text(metadata.submitted_at, 120) || row.created_at || null,
    applied_at: text(metadata.applied_at, 120) || null,
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
        actor_id: actor,
        mission_id: mission,
        action: controlAction,
        instruction: boundedInstruction,
        status,
        consume_at_safe_boundary: consumeAtSafeBoundary === true,
        submitted_at: now,
        applied_at: null,
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
} = {}) {
  const rows = await scopedRows({ context, missionId, active: true });
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
  if (!pending?.id) return { claimed: false, intervention: null };

  const metadata = object(pending.metadata);
  const appliedAt = new Date().toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      metadata: {
        ...metadata,
        status: "APPLIED",
        applied_at: appliedAt,
        authorization_effect: "NONE",
        commit_authority: false,
        production_deploy_authority: false,
      },
      updated_at: appliedAt,
    })
    .eq("id", pending.id)
    .eq("active", true)
    .select("id,metadata,active,created_at,updated_at")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { claimed: false, intervention: null };

  return {
    claimed: true,
    intervention: projection(result.data),
  };
}

export async function loadCodeAIOwnerControlState({
  context = {},
  missionId,
} = {}) {
  const rows = await scopedRows({ context, missionId });
  const projected = rows.map(projection);
  const pending = projected.find((item) => item.status === "PENDING") || null;
  const lastApplied = projected.find((item) => item.status === "APPLIED") || null;
  const review = projected.find(
    (item) => item.status === "RECORDED" && REVIEW_ACTIONS.has(item.action),
  ) || null;

  return {
    contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
    mission_id: normalizedMissionId(missionId),
    pending_intervention: pending,
    last_applied_intervention: lastApplied,
    latest_review: review,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

export const CodeAIOwnerInterventionRuntime = Object.freeze({
  contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
  submit: submitCodeAIOwnerControl,
  claim: claimPendingCodeAIOwnerIntervention,
  load: loadCodeAIOwnerControlState,
  intervention_actions: Object.freeze([...INTERVENTION_ACTIONS]),
  review_actions: Object.freeze([...REVIEW_ACTIONS]),
  authorization_effect: "NONE",
  commit_authority: false,
  production_deploy_authority: false,
});

export default CodeAIOwnerInterventionRuntime;
