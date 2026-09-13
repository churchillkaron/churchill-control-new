import { createHash } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { executeWorldClassMusicStudio } from "@/lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime";
import { executeMusicSurgicalRepair } from "@/lib/creative/music/runtime/CreativeMusicSurgicalRepairExecutionRuntime";
import { interpretMusicProjectDecision } from "@/lib/creative/music/runtime/CreativeMusicDecisionInterpreterRuntime";
import {
  loadMusicConversationState,
  musicConversationExecutionContext,
  updateMusicConversationState,
} from "@/lib/creative/music/runtime/CreativeMusicConversationStateRuntime";

const REQUIRED_PERMISSION = "creative.production.run";
function text(value) { return String(value ?? "").trim(); }

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "executeWorldClassProduction",
  name: "Run Music Studio production",
  description: "Execute a confirmed Music Studio job through the registered Avantiqo music/audio runtime. Can prepare its own Music project, execute certified original-music generation or implemented source cleanup/mix/master paths, fails closed on gated capabilities, preserves originals and never authorizes publication.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.music.production.executed"],
  tags: ["music", "audio", "studio", "production", "song", "backing-track", "stems", "master", "mix", "business-partner"],
  operatorAliases: [
    "make the music", "create the song", "run music studio", "produce the track",
    "make a backing track", "remove the vocals", "remove vocals", "separate the stems",
    "separate stems", "isolate the vocals", "mix this track", "mix this audio",
    "master this audio", "master this track", "make music for this video",
    "create a melody", "make a melody", "create sound effects", "make sound effects",
    "execute the music repair", "fix the failed music section",
  ],  operatorExamples: [
    "Create the music we just agreed on.",
    "Make this source audio professional and master it.",
    "Take this song, remove the vocals, lower it two semitones and make it stage ready.",
  ],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: false,
  approval: { required: false, boundary: "conversation_confirmation" },
  operatorVerification: {
    capability_key: "creative.studio.inspectProject",
    payload_from_result: { creative_project_id: ["creative_project_id"] },
    derivation: "declared_result_bound_creative_project_verifier",
  },
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      request_ref: { type: "string" },
      creative_project_id: { type: "string" },
      creative_mission_id: { type: "string" },
      master_asset_id: { type: "string" },
      repair_plan_hash: { type: "string" },
      title: { type: "string" },
      objective: { type: "string" },
      capabilities: { type: "array", items: { type: "string" } },
      source_media: { type: "string" },      source_audio: { type: "string" },
      source_rights_confirmed: { type: "boolean" },
      duration_seconds: { type: "number" },
      style: { type: "string" },
      mood: { type: "string" },
      energy: { type: "string" },
      instrumentation: { type: "string" },
      structure: { type: "string" },
      bpm: { type: "number" },
      keyscale: { type: "string" },
      instrumental: { type: "boolean" },
      lyrics: { type: "string" },
      vocal_language: { type: "string" },
      mastering_profile: { type: "string" },
      currency: { type: "string" },
      conversation_state_patch: { type: "object" },
      decision_summary: { type: "string" },
    },
    required: [],
    additionalProperties: true,
  },
});

export function validate({ payload = {} }) {
  const repair = text(payload.repair_plan_hash) || text(payload.master_asset_id);
  if (repair) {
    if (!text(payload.creative_project_id) || !text(payload.master_asset_id) || !text(payload.repair_plan_hash)) {
      const error = new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_EXECUTION_REFERENCE_REQUIRED");
      error.status = 400;
      throw error;
    }
    if (payload.source_rights_confirmed !== true) {
      const error = new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_SOURCE_RIGHTS_REQUIRED");
      error.status = 400;
      throw error;
    }
    return true;
  }
  if (!text(payload.objective)) {
    const error = new Error("CREATIVE_MUSIC_WORLD_CLASS_OBJECTIVE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

function stableRequestRef(context, payload) {
  const explicit = text(payload.request_ref);
  if (explicit) return explicit;
  const conversationId = text(context?.metadata?.conversationId);
  if (!conversationId) return null;
  const fingerprint = createHash("sha256")
    .update([context.organizationId, conversationId, "music-studio"].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `business-partner-music:${fingerprint}`;
}
async function ensureMusicProject(context, payload) {
  const requestRef = stableRequestRef(context, payload);
  if (text(payload.creative_project_id) || requestRef) {
    try {
      return await resolveOperatorCreativeProject({
        organizationId: context.organizationId,
        creativeProjectId: payload.creative_project_id,
        requestRef,
      });
    } catch (error) {
      if (text(payload.creative_project_id)) throw error;
      if (error?.message !== "CREATIVE_OPERATOR_PROJECT_NOT_FOUND") throw error;
    }
  }
  const mission = await CreativeMissionRuntime.create({
    organization_id: context.organizationId,
    title: text(payload.title || "Business Partner Music Studio"),
    business_goal: text(payload.objective),
    objective: text(payload.objective),
    status: "draft",
    approval_state: "not_required",
    metadata: {
      source: "AVANTIQO_BUSINESS_PARTNER_MUSIC",
      source_type: "operator_chat",
      source_reference: requestRef,
      public_publish_authorized: false,
      publish_authorized: false,
      publication_requires_human_approval: true,
      workflow_kind: "AUDIO",
    },
  });
  const started = await CreativeMissionRuntime.start(mission.id);
  return {
    mission: started,
    project: {
      id: started.runtime_context?.creative_project_id,
      creative_mission_id: started.id,
      organization_id: context.organizationId,
    },
    request_ref: requestRef,
  };
}

export async function execute({ context, payload = {} }) {
  if (text(payload.repair_plan_hash) && text(payload.master_asset_id)) {
    const resolvedRepairProject = await resolveOperatorCreativeProject({
      organizationId: context.organizationId,
      creativeProjectId: payload.creative_project_id,
      requestRef: null,
    });
    if (!text(resolvedRepairProject?.project?.id)) throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_PROJECT_NOT_FOUND");
    const result = await executeMusicSurgicalRepair({
      organization_id: context.organizationId,
      creative_project_id: resolvedRepairProject.project.id,
      creative_mission_id: text(payload.creative_mission_id || resolvedRepairProject.mission?.id || resolvedRepairProject.project.creative_mission_id) || null,
      master_asset_id: payload.master_asset_id,
      expected_repair_plan_hash: payload.repair_plan_hash,
      source_rights_confirmed: payload.source_rights_confirmed === true,
    });
    return { ...result, creative_project_id: resolvedRepairProject.project.id, publish_authorized: false };
  }
  const resolved = await ensureMusicProject(context, payload);
  if (!text(resolved?.project?.id)) throw new Error("CREATIVE_MUSIC_PROJECT_PREPARATION_FAILED");
  const loadedConversation = await loadMusicConversationState({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
  });
  const musicConversationContext = musicConversationExecutionContext(loadedConversation.state);
  const result = await executeWorldClassMusicStudio({
    ...payload,
    request_ref: resolved.request_ref || payload.request_ref || null,
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    creative_mission_id: text(payload.creative_mission_id || resolved.mission?.id || resolved.project.creative_mission_id) || null,
    music_conversation_context: musicConversationContext,
  });
  const interpretedDecision = interpretMusicProjectDecision(payload.objective);
  const decisionSummary = text(payload.decision_summary) || interpretedDecision.decision_summary || null;
  const versionLineage = result?.master_asset?.id
    ? [{ id: result.master_asset.id, master_asset_id: result.master_asset.id, summary: decisionSummary }]
    : (result?.asset?.id ? [{ id: result.asset.id, master_asset_id: result.asset.id, summary: decisionSummary }] : []);
  let conversationState = loadedConversation.state;
  let conversationStatePersisted = true;
  let conversationStateError = null;
  try {
    conversationState = await updateMusicConversationState({
      organization_id: context.organizationId,
      creative_project_id: resolved.project.id,
      patch: {
        ...(interpretedDecision.patch || {}),
        ...(payload.conversation_state_patch || {}),
        ...(!loadedConversation.state.creative_intent && text(payload.objective) ? { creative_intent: text(payload.objective) } : {}),
        ...(versionLineage.length ? { version_lineage: versionLineage } : {}),
      },
      decision_summary: decisionSummary,
    });
  } catch (error) {
    conversationStatePersisted = false;
    conversationStateError = text(error?.message || error);
  }
  return {
    ...result,
    request_ref: resolved.request_ref || payload.request_ref || null,
    creative_project_id: resolved.project.id,
    creative_mission_id: text(payload.creative_mission_id || resolved.mission?.id || resolved.project.creative_mission_id) || null,
    music_conversation_context: musicConversationExecutionContext(conversationState),
    music_conversation_interpretation: interpretedDecision,
    music_conversation_state_persisted: conversationStatePersisted,
    music_conversation_state_error: conversationStateError,
    publish_authorized: false,
  };
}
