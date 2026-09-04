import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";
import {
  CreativeChatShotReferenceRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotReferenceRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function boundedLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
}

function authoritySummary(shot = {}) {
  const authority = CreativeProfessionalDirectionAuthorityRuntime.authority(shot);
  const lockedFields = CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot);
  return {
    contract: text(authority.contract, 160) || null,
    human_authoritative: authority.human_authoritative === true || lockedFields.length > 0,
    ai_may_edit_unlocked_fields: authority.ai_may_edit_unlocked_fields !== false,
    locked_fields: lockedFields,
    latest_changed_fields: Array.isArray(authority.latest_changed_fields)
      ? authority.latest_changed_fields.slice(0, 40)
      : [],
    revision_reason: text(authority.revision_reason, 900) || null,
    updated_at: text(authority.updated_at, 120) || null,
  };
}

function shotSummary(shot = {}) {
  return {
    shot_id: text(shot.id, 180),
    scene_id: text(shot.scene_id, 180) || null,
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    title: text(shot.title, 500) || null,
    purpose: text(shot.purpose, 900) || null,
    duration_seconds: Number(shot.duration_seconds || 0) || null,
    revision_number: Number(shot.metadata?.revision_number || 0),
    direction_authority: text(shot.metadata?.direction_authority, 160) || null,
    professional_direction: authoritySummary(shot),
  };
}

function shotDetail(shot = {}) {
  return {
    ...shotSummary(shot),
    subject: text(shot.subject, 1200) || null,
    action: text(shot.action, 1800) || null,
    performance: text(shot.performance, 1800) || null,
    camera: object(shot.camera),
    coverage: object(shot.coverage || shot.metadata?.coverage),
    continuity: object(shot.continuity),
    frame_plan: object(shot.frame_plan),
    transition_in: text(shot.transition_in, 1200) || null,
    transition_out: text(shot.transition_out, 1200) || null,
  };
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "inspectDirection",
  description:
    "Inspect canonical shot direction for one verified Creative Studio project from Chat. It can resolve an exact shot_id or a natural shot_reference such as 'this shot', 'previous shot', 'next shot', 'shot 7', a shot title, or a visual/camera description. Relative references require the server-verified active anchor_shot_id from Creative context. Returns exact shot identity, Cinematic Coverage state, revision state, and Pro Studio human-authority locks. Read-only: never revises direction, generates media, spends wallet balance, or publishes.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: [
    "creative",
    "video",
    "studio",
    "chat",
    "direction",
    "shot",
    "reference-resolution",
    "coverage",
    "human-authority",
    "read",
  ],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  approval: "none",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      request_ref: { type: "string" },
      creative_project_id: { type: "string" },
      shot_id: { type: "string" },
      shot_reference: {
        type: "string",
        description:
          "Natural reference to resolve inside the verified project, for example this shot, previous shot, next shot, shot 7, a title, or a visual/camera description.",
      },
      anchor_shot_id: {
        type: "string",
        description:
          "Server-verified active shot from Creative context. Required only for relative references such as this/previous/next.",
      },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { const: "DIRECTION_FOUND" },
      request_ref: { type: ["string", "null"] },
      creative_mission_id: { type: ["string", "null"] },
      creative_project_id: { type: "string" },
      selected_shot_id: { type: ["string", "null"] },
      selected_scene_id: { type: ["string", "null"] },
      selected_shot_number: { type: ["number", "null"] },
      selected_shot_title: { type: ["string", "null"] },
      selected_revision_number: { type: ["number", "null"] },
      shot_reference_resolution: { type: ["string", "null"] },
      shot_count: { type: "number" },
      returned_shot_count: { type: "number" },
      truncated: { type: "boolean" },
      professional_locked_field_count: { type: "number" },
      shots: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },
    },
    required: [
      "status",
      "creative_project_id",
      "shot_count",
      "returned_shot_count",
      "truncated",
      "shots",
    ],
  },
});

export function validate({ payload = {} }) {
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
  const project = resolved.project;
  const shots = await ShotRuntime.list({
    organization_id: context.organizationId,
    creative_project_id: project.id,
  });

  const requestedShotId = text(payload.shot_id, 180);
  const shotReference = text(payload.shot_reference, 1200);
  let selected = null;
  let referenceResolution = null;

  if (requestedShotId || shotReference) {
    const reference = await CreativeChatShotReferenceRuntime.resolve({
      organization_id: context.organizationId,
      creative_project_id: project.id,
      shot_id: requestedShotId || null,
      shot_reference: shotReference || null,
      anchor_shot_id: text(payload.anchor_shot_id, 180) || null,
    });
    selected = reference.shot;
    referenceResolution = reference.resolution;
  }

  const returnedShots = selected
    ? [shotDetail(selected)]
    : shots.slice(0, boundedLimit(payload.limit)).map(shotSummary);

  const professionalLockedFieldCount = shots.reduce(
    (sum, shot) =>
      sum + CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot).length,
    0,
  );

  return {
    status: "DIRECTION_FOUND",
    request_ref: resolved.request_ref || null,
    creative_mission_id:
      resolved.mission?.id || text(project.creative_mission_id, 180) || null,
    creative_project_id: project.id,
    project_status: text(project.status, 80) || null,
    production_type: text(project.production_type, 80) || null,
    selected_shot_id: selected ? text(selected.id, 180) : null,
    selected_scene_id: selected ? text(selected.scene_id, 180) || null : null,
    selected_shot_number: selected ? Number(selected.shot_number || 0) || null : null,
    selected_shot_title: selected ? text(selected.title, 500) || null : null,
    selected_revision_number: selected
      ? Number(selected.metadata?.revision_number || 0)
      : null,
    shot_reference_resolution: referenceResolution,
    shot_count: shots.length,
    returned_shot_count: returnedShots.length,
    truncated: !selected && returnedShots.length < shots.length,
    professional_locked_field_count: professionalLockedFieldCount,
    shots: returnedShots,
    media_generation_executed: false,
    publish_authorized: false,
  };
}
