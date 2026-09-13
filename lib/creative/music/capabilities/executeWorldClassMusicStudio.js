import { createHash } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { executeWorldClassMusicStudio } from "@/lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime";

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
    },
    required: ["objective"],
    additionalProperties: true,
  },
});

export function validate({ payload = {} }) {
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
    .update([context.organizationId, conversationId, text(payload.objective).toLowerCase()].join("|"))
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
  const resolved = await ensureMusicProject(context, payload);
  if (!text(resolved?.project?.id)) throw new Error("CREATIVE_MUSIC_PROJECT_PREPARATION_FAILED");
  const result = await executeWorldClassMusicStudio({
    ...payload,
    request_ref: resolved.request_ref || payload.request_ref || null,
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    creative_mission_id: text(payload.creative_mission_id || resolved.mission?.id || resolved.project.creative_mission_id) || null,
  });
  return {
    ...result,
    request_ref: resolved.request_ref || payload.request_ref || null,
    creative_project_id: resolved.project.id,
    creative_mission_id: text(payload.creative_mission_id || resolved.mission?.id || resolved.project.creative_mission_id) || null,
    publish_authorized: false,
  };
}
