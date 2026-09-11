import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TYPES = new Set(["VEHICLE", "EQUIPMENT", "PROPERTY", "DIGITAL_ASSET"]);
function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function optional(value, limit = 4000) { return text(value, limit) || null; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function date(value) { const v = optional(value, 20); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Date fields must use YYYY-MM-DD"); return v; }

export function createComplianceAssetCreateCapability() {
  const manifest = defineCapability({
    domain: "compliance", capability: "assets", action: "create",
    description: "Create an entity-scoped operational compliance asset without creating or changing Finance depreciation records.",
    permissions: [], events: ["compliance.assets.created"], tags: ["compliance", "assets", "equipment", "vehicles", "property", "digital-assets"],
    transactional: true, aiEnabled: false, operatorEnabled: true, operatorMode: "write", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "medium", contextScope: "entity",
    operatorVerification: { capability_key: "compliance.assets.read", payload_from_result: { asset_id: ["asset.id"] }, derivation: "declared_result_bound_record_verifier" },
    inputSchema: { type: "object", required: ["asset_type", "asset_code", "name"], additionalProperties: false, properties: {
      asset_type:{type:"string"}, asset_code:{type:"string"}, name:{type:"string"}, description:{type:"string"}, manufacturer:{type:"string"}, model:{type:"string"},
      serial_number:{type:"string"}, registration_number:{type:"string"}, reference_identifier:{type:"string"}, location_text:{type:"string"}, ownership_type:{type:"string"},
      status:{type:"string"}, acquired_on:{type:"string"}, acquisition_cost:{type:"number"}, currency_code:{type:"string"}, warranty_expires_on:{type:"string"},
      inspection_due_on:{type:"string"}, maintenance_due_on:{type:"string"}, finance_fixed_asset_id:{type:"string"}, source_attachment_sha256:{type:"string"}, attributes:{type:"object"}
    }}
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("COMPLIANCE_ASSET_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "COMPLIANCE_ASSET_ORGANIZATION_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id,160) !== text(context.actor?.id,160)) { const error = new Error("COMPLIANCE_ASSET_EXECUTION_ACTOR_MISMATCH"); error.status=403; throw error; }
    if (!context.entityId) throw new Error("COMPLIANCE_ASSET_ENTITY_REQUIRED");
    const assetType = text(payload.asset_type,40).toUpperCase();
    if (!TYPES.has(assetType)) throw new Error("COMPLIANCE_ASSET_TYPE_INVALID");
    const rpc = await supabaseAdmin.rpc("create_compliance_asset_atomic", {
      p_organization_id: context.organizationId, p_entity_id: context.entityId, p_asset_type: assetType,
      p_asset_code: text(payload.asset_code,160), p_name: text(payload.name,500), p_description: optional(payload.description,4000),
      p_manufacturer: optional(payload.manufacturer,300), p_model: optional(payload.model,300), p_serial_number: optional(payload.serial_number,300),
      p_registration_number: optional(payload.registration_number,300), p_reference_identifier: optional(payload.reference_identifier,500), p_location_text: optional(payload.location_text,500),
      p_ownership_type: text(payload.ownership_type || "OWNED",40).toUpperCase(), p_status: text(payload.status || "ACTIVE",40).toUpperCase(),
      p_acquired_on: date(payload.acquired_on), p_acquisition_cost: number(payload.acquisition_cost), p_currency_code: optional(payload.currency_code,12),
      p_warranty_expires_on: date(payload.warranty_expires_on), p_inspection_due_on: date(payload.inspection_due_on), p_maintenance_due_on: date(payload.maintenance_due_on),
      p_finance_fixed_asset_id: optional(payload.finance_fixed_asset_id,160), p_source_attachment_sha256: optional(payload.source_attachment_sha256,128),
      p_attributes: payload.attributes && typeof payload.attributes === "object" && !Array.isArray(payload.attributes) ? payload.attributes : {},
      p_created_by: context.actor?.staffAccountId || context.actor?.staff_account_id || null,
    });
    if (rpc.error) throw rpc.error;
    return { success: true, asset: rpc.data, finance_impact: "NONE", finance_fixed_asset_created: false };
  }
  return { manifest, execute };
}
export default createComplianceAssetCreateCapability;
