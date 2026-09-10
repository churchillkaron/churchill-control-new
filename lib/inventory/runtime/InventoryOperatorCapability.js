import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, maximum = 4000) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }

export function createInventoryItemsImportCapability() {
  const manifest = defineCapability({
    domain: "supply-chain", capability: "inventory_items", action: "import",
    description: "Atomically import reviewed inventory item master rows without overwriting existing item codes.",
    permissions: [], events: ["supply_chain.inventory_items.imported"],
    tags: ["supply-chain", "inventory", "items", "import"], transactional: true,
    aiEnabled: false, operatorEnabled: true, operatorMode: "write", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "medium", contextScope: "entity",
    inputSchema: {
      type: "object", required: ["rows"],
      properties: { rows: { type: "array", minItems: 1, maxItems: 500, items: { type: "object" } } },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("INVENTORY_IMPORT_CALLER_REQUEST_REQUIRED");
    if (!text(context.entityId, 160)) throw new Error("INVENTORY_IMPORT_ENTITY_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "INVENTORY_IMPORT_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id, 160) !== text(context.actor?.id, 160)) { const error = new Error("INVENTORY_IMPORT_ACTOR_MISMATCH"); error.status = 403; throw error; }
    const rows = list(payload.rows).map((row) => ({
      code: text(row?.code, 160), name: text(row?.name, 500), type: text(row?.type, 120) || "RAW_MATERIAL",
      cost: Number.isFinite(Number(row?.cost)) ? Number(row.cost) : 0,
      sale_price: Number.isFinite(Number(row?.sale_price)) ? Number(row.sale_price) : 0,
    }));
    if (!rows.length || rows.some((row) => !row.code || !row.name)) throw new Error("INVENTORY_IMPORT_INVALID_REVIEW_ROWS");
    const result = await supabaseAdmin.rpc("import_inventory_items_atomic", {
      p_organization_id: context.organizationId, p_entity_id: context.entityId, p_rows: rows,
    });
    if (result.error) throw result.error;
    return { success: true, import: result.data, authorization_effect: "CONFIRMED_OPERATOR_WRITE" };
  }
  return { manifest, execute };
}

export default createInventoryItemsImportCapability;
