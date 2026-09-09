import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import * as CreativeAssetRepository from "@/lib/creative/assets/repositories/CreativeAssetRepository";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "creative.media.inspect";

function text(value) {
  return String(value ?? "").trim();
}

function mimeType(asset = {}) {
  return text(
    asset.metadata?.mime_type ||
    asset.metadata?.technical?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ) || null;
}

async function scopedProject(context, payload) {
  const projectId = text(payload.creative_project_id || payload.project_id);
  if (!projectId) throw new Error("CREATIVE_STUDIO_PROJECT_REQUIRED");
  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || text(project.organization_id) !== text(context.organizationId)) {
    throw new Error("CREATIVE_STUDIO_PROJECT_NOT_FOUND");
  }
  return project;
}

function output(asset = {}) {
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
  action: "listOutputs",
  name: "Show Studio outputs",
  description:
    "List the newest canonical Creative Assets produced by an existing Studio project so Business Partner can present images, videos, audio and files in the conversation.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["creative", "studio", "assets", "outputs", "image", "video", "read"],
  operatorAliases: [
    "show me the video",
    "show me the image",
    "show studio outputs",
    "show the result",
    "open the latest creative",
    "show what studio made",
  ],
  operatorExamples: [
    "Show me the latest video from this Studio project.",
    "Show me the images Studio created.",
  ],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  inputSchema: {
    type: "object",
    properties: {
      creative_project_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 12 },
    },
    required: ["creative_project_id"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      creative_project_id: { type: "string" },
      outputs: { type: "array" },
      count: { type: "integer" },
    },
    required: ["creative_project_id", "outputs", "count"],
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
  const requestedLimit = Number(payload.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(12, requestedLimit))
    : 8;
  const assets = await CreativeAssetRepository.list({
    organization_id: context.organizationId,
    creative_mission_id: project.creative_mission_id || null,
    creative_project_id: project.id,
    limit,
  });
  const outputs = assets.slice(0, limit).map(output);
  return {
    creative_project_id: project.id,
    creative_mission_id: project.creative_mission_id || null,
    outputs,
    count: outputs.length,
    read_only: true,
  };
}
