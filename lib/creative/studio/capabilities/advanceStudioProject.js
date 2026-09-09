import { CreativePartnerMissionRuntime } from "@/lib/creative/partner/runtime/CreativePartnerMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import * as CreativeAssetRepository from "@/lib/creative/assets/repositories/CreativeAssetRepository";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "creative.production.run";

function text(value) {
  return String(value ?? "").trim();
}

function mimeType(asset = {}) {
  return (
    text(
      asset.metadata?.mime_type ||
        asset.metadata?.technical?.mime_type ||
        asset.analysis?.technical?.mime_type,
    ) || null
  );
}

async function scopedProject(context, payload) {
  const projectId = text(payload.creative_project_id || payload.project_id);
  if (!projectId) throw new Error("CREATIVE_STUDIO_PROJECT_REQUIRED");
  const project = await CreativeProjectRuntime.get(projectId);
  if (
    !project ||
    text(project.organization_id) !== text(context.organizationId)
  ) {
    throw new Error("CREATIVE_STUDIO_PROJECT_NOT_FOUND");
  }
  return project;
}

function presentableAsset(asset = {}) {
  return {
    id: asset.id,
    title: asset.title || asset.name || asset.file_name || "Studio output",
    asset_type: asset.asset_type || null,
    file_url: asset.file_url || null,
    image_url: asset.image_url || null,
    thumbnail_url: asset.thumbnail_url || null,
    mime_type: mimeType(asset),
    created_at: asset.created_at || null,
  };
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "advanceProject",
  name: "Run Studio production",
  description:
    "Advance an existing Creative Studio project through its canonical partner mission. Uses Studio directors, workers, Service Runtime, quality gates and repair logic; it never invokes a provider or generator directly.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.studio.production.advanced"],
  tags: [
    "creative",
    "studio",
    "production",
    "image",
    "video",
    "audio",
    "design",
  ],
  operatorAliases: [
    "run studio production",
    "continue the studio project",
    "make the image",
    "make the video",
    "produce the creative",
    "continue production",
  ],
  operatorExamples: [
    "Create the video we just agreed on in Studio.",
    "Continue production on this Creative Studio project.",
    "Make the approved image now.",
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
  inputSchema: {
    type: "object",
    properties: {
      creative_project_id: { type: "string" },
      creative_mission_id: { type: "string" },
      workflow_kind: { type: "string" },
    },
    required: ["creative_project_id"],
    additionalProperties: true,
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      creative_project_id: { type: "string" },
      creative_mission_id: { type: "string" },
      mission: { type: "object" },
      outputs: { type: "array" },
    },
    required: ["success", "creative_project_id", "mission", "outputs"],
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.creative_project_id || payload.project_id)) {
    const error = new Error("CREATIVE_STUDIO_PROJECT_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const project = await scopedProject(context, payload);
  const missionId = text(
    payload.creative_mission_id ||
      project.creative_mission_id ||
      project.campaign_id,
  );
  const partner = await CreativePartnerMissionRuntime.advance({
    ...payload,
    organization_id: context.organizationId,
    creative_project_id: project.id,
    creative_mission_id: missionId || undefined,
    requested_by:
      context.actor?.partyId ||
      context.actor?.party_id ||
      context.actor?.id ||
      null,
    workflow_kind: text(payload.workflow_kind) || "TEMPORAL",
  });
  const assets = await CreativeAssetRepository.list({
    organization_id: context.organizationId,
    creative_mission_id: missionId || null,
    creative_project_id: project.id,
    limit: 12,
  });

  return {
    success: partner?.success !== false,
    creative_project_id: project.id,
    creative_mission_id: missionId || null,
    mission: partner?.mission || {},
    outputs: assets.slice(0, 8).map(presentableAsset),
    provider_selection_exposed: false,
    generator_embedded_in_business_partner: false,
    studio_runtime_used: true,
  };
}
