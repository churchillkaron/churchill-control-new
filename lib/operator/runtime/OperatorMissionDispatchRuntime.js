import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const OPERATOR_MISSION_DISPATCH_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_DISPATCH_V1";

const TABLE = "operator_mission_dispatches";
const MISSION_KEY = "platform.operator_mission.execute";
const MUTATING_MODES = new Set(["draft", "write", "approve"]);
const VALID_STATES = new Set([
  "claimed",
  "dispatched",
  "verified",
  "uncertain",
  "failed",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
      .map((key) => [key, canonical(value[key])]),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function operatorMissionPayloadFingerprint(payload = {}) {
  return sha256(JSON.stringify(canonical(object(payload))));
}

export function operatorMissionDispatchKey({
  organizationId,
  missionExecutionId,
  missionStepId,
  capabilityKey,
  payload = {},
} = {}) {
  const material = [
    text(organizationId),
    text(missionExecutionId),
    text(missionStepId),
    text(capabilityKey),
    operatorMissionPayloadFingerprint(payload),
  ].join("\n");
  return sha256(material);
}

function missionChildMetadata(metadata = {}) {
  const current = object(metadata);
  return {
    mission_execution_id: text(current.operatorMissionExecutionId) || null,
    mission_step_id: text(current.missionStepId) || null,
    parent_capability_key: text(current.parentCapabilityKey) || null,
    source: text(current.source) || null,
  };
}

export function shouldJournalOperatorMissionDispatch({ mode, metadata } = {}) {
  const current = missionChildMetadata(metadata);
  return Boolean(
    MUTATING_MODES.has(text(mode).toLowerCase()) &&
      current.parent_capability_key === MISSION_KEY &&
      current.mission_execution_id &&
      current.mission_step_id &&
      current.source === "AVANTIQO_OPERATOR_MISSION",
  );
}

export function shouldVerifyOperatorMissionDispatch({ mode, metadata } = {}) {
  const current = missionChildMetadata(metadata);
  return Boolean(
    text(mode).toLowerCase() === "read" &&
      current.parent_capability_key === MISSION_KEY &&
      current.mission_execution_id &&
      current.mission_step_id &&
      current.source === "AVANTIQO_OPERATOR_MISSION_VERIFY",
  );
}

async function loadExisting({ organizationId, dispatchKey }) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      "id, organization_id, mission_execution_id, mission_step_id, capability_key, payload_fingerprint, dispatch_key, state, prepared_at, dispatched_at, verified_at, failed_at, last_error, metadata, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("dispatch_key", dispatchKey)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function claimOperatorMissionDispatch({
  organizationId,
  missionExecutionId,
  missionStepId,
  capabilityKey,
  payload = {},
  metadata = {},
} = {}) {
  const payloadFingerprint = operatorMissionPayloadFingerprint(payload);
  const dispatchKey = operatorMissionDispatchKey({
    organizationId,
    missionExecutionId,
    missionStepId,
    capabilityKey,
    payload,
  });

  const row = {
    organization_id: organizationId,
    mission_execution_id: missionExecutionId,
    mission_step_id: missionStepId,
    capability_key: capabilityKey,
    payload_fingerprint: payloadFingerprint,
    dispatch_key: dispatchKey,
    state: "claimed",
    metadata: {
      contract: OPERATOR_MISSION_DISPATCH_CONTRACT,
      replay_policy: "verification_only",
      ...object(metadata),
    },
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(row)
    .select(
      "id, organization_id, mission_execution_id, mission_step_id, capability_key, payload_fingerprint, dispatch_key, state, prepared_at, dispatched_at, verified_at, failed_at, last_error, metadata, updated_at",
    )
    .single();

  if (!error) {
    return {
      contract: OPERATOR_MISSION_DISPATCH_CONTRACT,
      claimed: true,
      recovery_only: false,
      dispatch_key: dispatchKey,
      dispatch: data,
    };
  }

  if (text(error.code) !== "23505") throw error;

  const existing = await loadExisting({ organizationId, dispatchKey });
  if (!existing) {
    throw new Error("OPERATOR_MISSION_DISPATCH_DUPLICATE_WITHOUT_JOURNAL_ROW");
  }

  return {
    contract: OPERATOR_MISSION_DISPATCH_CONTRACT,
    claimed: false,
    recovery_only: true,
    dispatch_key: dispatchKey,
    dispatch: existing,
  };
}

export async function updateOperatorMissionDispatchState({
  organizationId,
  dispatchKey,
  state,
  error = null,
} = {}) {
  const normalizedState = text(state).toLowerCase();
  if (!VALID_STATES.has(normalizedState)) {
    throw new Error("OPERATOR_MISSION_DISPATCH_STATE_INVALID");
  }

  const now = new Date().toISOString();
  const patch = {
    state: normalizedState,
    updated_at: now,
    last_error: text(error).slice(0, 800) || null,
    ...(normalizedState === "dispatched" ? { dispatched_at: now } : {}),
    ...(normalizedState === "verified" ? { verified_at: now } : {}),
    ...(["uncertain", "failed"].includes(normalizedState) ? { failed_at: now } : {}),
  };

  const { data, error: updateError } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("dispatch_key", dispatchKey)
    .select("id, dispatch_key, state, updated_at")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!data) throw new Error("OPERATOR_MISSION_DISPATCH_JOURNAL_ROW_MISSING");
  return data;
}

export async function markOperatorMissionStepVerified({
  organizationId,
  missionExecutionId,
  missionStepId,
} = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      state: "verified",
      verified_at: now,
      updated_at: now,
      last_error: null,
    })
    .eq("organization_id", organizationId)
    .eq("mission_execution_id", text(missionExecutionId))
    .eq("mission_step_id", text(missionStepId))
    .select("id, dispatch_key, state, updated_at");

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function missionDispatchRecoveryError(claim) {
  const error = new Error("OPERATOR_MISSION_DISPATCH_RECOVERY_REQUIRED");
  error.code = "OPERATOR_MISSION_DISPATCH_RECOVERY_REQUIRED";
  error.operatorMissionDispatch = claim?.dispatch || null;
  error.operatorMissionDispatchKey = text(claim?.dispatch_key) || null;
  error.operatorMissionReplayAllowed = false;
  return error;
}

export default {
  contract: OPERATOR_MISSION_DISPATCH_CONTRACT,
  shouldJournal: shouldJournalOperatorMissionDispatch,
  shouldVerify: shouldVerifyOperatorMissionDispatch,
  fingerprint: operatorMissionPayloadFingerprint,
  dispatchKey: operatorMissionDispatchKey,
  claim: claimOperatorMissionDispatch,
  updateState: updateOperatorMissionDispatchState,
  markStepVerified: markOperatorMissionStepVerified,
  recoveryError: missionDispatchRecoveryError,
};