import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import { executeWorldClassMusicStudio } from "@/lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime";

const REQUIRED_PERMISSION = "creative.production.run";

function text(value) {
  return String(value ?? "").trim();
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "executeWorldClassProduction",
  name: "Run Music Studio production",
  description: "Execute a confirmed Music Studio job through the registered Avantiqo music/audio runtime. Supports certified original-music generation plus implemented source cleanup/mix/master paths, fails closed on gated capabilities, preserves originals and never authorizes publication.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.music.production.executed"],
  tags: ["music", "audio", "studio", "production", "song", "master", "mix", "business-partner"],
  operatorAliases: ["make the music", "create the song", "run music studio", "produce the track", "master this audio"],
  operatorExamples: ["Create the music we just agreed on.", "Make this source audio professional and master it."],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: false,
  approval: { required: false, boundary: "conversation_confirmation" },
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
      source_media: { type: "string" },
      source_audio: { type: "string" },
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
  if (!text(payload.request_ref) && !text(payload.creative_project_id)) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const resolved = await resolveOperatorCreativeProject({
    organizationId: context.organizationId,
    creativeProjectId: payload.creative_project_id,
    requestRef: payload.request_ref,
  });
  return executeWorldClassMusicStudio({
    ...payload,
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    creative_mission_id: text(payload.creative_mission_id || resolved.mission?.id || resolved.project.creative_mission_id) || null,
  });
}
