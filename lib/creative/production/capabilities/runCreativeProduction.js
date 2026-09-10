import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { ProductionRuntime } from "@/lib/creative/production/runtime/ProductionRuntime";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value) {
  return String(value ?? "").trim();
}

function count(queue, key) {
  return Array.isArray(queue?.[key]) ? queue[key].length : 0;
}

function presentationArtifacts(assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => text(asset?.url || asset?.file_url || asset?.image_url || asset?.thumbnail_url))
    .slice(0, 24)
    .map((asset, index) => ({
      url: text(asset.url || asset.file_url || asset.image_url || asset.thumbnail_url),
      label: text(asset.title || asset.name || asset.file_name) || `Creative output ${index + 1}`,
      mime_type: text(asset.mime_type || asset.metadata?.mime_type || asset.analysis?.mime_type) || null,
      folder: text(asset.previewType || asset.asset_type || asset.type) || "Creative outputs",
      asset_id: text(asset.id || asset.asset_id) || null,
    }));
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "production",
  action: "run",
  description:
    "Run the existing governed Creative production queue for one canonical Studio project. This may dispatch paid video/media providers and consume prepaid service balance, so it always requires explicit conversation confirmation. It never authorizes publication.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.production.run"],
  tags: ["creative", "video", "production", "provider-dispatch", "paid-media"],
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
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      complete: { type: "boolean" },
      status: { type: "string" },
      request_ref: { type: ["string", "null"] },
      creative_project_id: { type: "string" },
      dispatched: { type: "number" },
      assets_created: { type: "number" },
      running: { type: "number" },
      review: { type: "number" },
      failed: { type: "number" },
      blocked: { type: "number" },
      publish_authorized: { const: false },
    },
    required: [
      "success",
      "complete",
      "status",
      "creative_project_id",
      "dispatched",
      "publish_authorized"
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
  const result = await ProductionRuntime.runProduction({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
  });
  const queue = result.queue || {};
  const { CreativeAssetsRuntime } = await import(
    "@/lib/creative/assets/runtime/CreativeAssetsRuntime"
  );
  const assets = await CreativeAssetsRuntime.list({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
    limit: 48,
  });

  return {
    success: result.success === true,
    complete: result.complete === true,
    status: text(result.status) || "PRODUCTION_IN_PROGRESS",
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    dispatched: Number(result.dispatched || 0),
    assets_created: Number(result.assets_created || 0),
    running: count(queue, "running"),
    review: count(queue, "review"),
    failed: count(queue, "failed"),
    blocked: count(queue, "blocked"),
    artifacts: presentationArtifacts(assets),
    publish_authorized: false,
  };
}
