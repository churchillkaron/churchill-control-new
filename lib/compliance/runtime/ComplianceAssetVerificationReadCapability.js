import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);

export function createComplianceAssetVerificationReadCapability() {
  const manifest = defineCapability({
    domain: "compliance", capability: "assets", action: "read",
    description: "Read one exact entity-scoped compliance asset for deterministic post-action verification.",
    permissions: [], events: [], tags: ["compliance", "assets", "read", "verification"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope: "entity",
    inputSchema: { type: "object", required: ["asset_id"], properties: { asset_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("COMPLIANCE_ASSET_READ_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "COMPLIANCE_ASSET_READ_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    const assetId = text(payload.asset_id, 160); const entityId = text(context.entityId, 160);
    if (!assetId || !entityId) throw new Error("COMPLIANCE_ASSET_READ_SCOPE_REQUIRED");
    const result = await supabaseAdmin.from("compliance_assets").select("*")
      .eq("organization_id", access.organizationId).eq("entity_id", entityId).eq("id", assetId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) { const error = new Error("COMPLIANCE_ASSET_NOT_FOUND"); error.status = 404; throw error; }
    return { success: true, asset: result.data, asset_id: result.data.id };
  }
  return { manifest, execute };
}
export default createComplianceAssetVerificationReadCapability;
