import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const REQUIRED_PERMISSION = "procurement.manage";
const text = (value) => String(value ?? "").trim();
const actorId = (context = {}) => text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);

export function createSupplierPriceImportCapability() {
  const manifest = defineCapability({
    domain:"supply-chain", capability:"supplier_prices", action:"import",
    name:"Import supplier prices", description:"Atomically apply reviewed current supplier prices for exact matched inventory items.",
    permissions:[REQUIRED_PERMISSION], events:["supply_chain.supplier_prices.imported"],
    tags:["supply-chain","procurement","supplier","prices","import"], transactional:true,
    aiEnabled:false, operatorEnabled:true, operatorMode:"approve", operatorAutoExecute:false,
    operatorRequiresConfirmation:true, risk:"high", reversible:true, contextScope:"entity",
    inputSchema:{ type:"object", required:["supplier_party_id","rows"], properties:{
      supplier_party_id:{type:"string"}, rows:{type:"array",minItems:1,maxItems:500},
      source_attachment_sha256:{type:"string"}, source_reference:{type:"string"},
    }, additionalProperties:false },
  });
  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, REQUIRED_PERMISSION);
    const organizationId=text(context.organizationId), entityId=text(context.entityId), actor=actorId(context);
    if (!organizationId || !entityId || !actor) throw new Error("Authenticated organization/entity actor required");
    if (!text(payload.supplier_party_id)) throw new Error("supplier_party_id required");
    if (!Array.isArray(payload.rows) || !payload.rows.length) throw new Error("rows required");
    const rows=payload.rows.map((row)=>({
      item_id:text(row?.item_id),
      price:Number(row?.price),
      minimum_order_quantity:Number(row?.minimum_order_quantity || 1),
    }));
    if (rows.some((row)=>!row.item_id || !Number.isFinite(row.price) || row.price < 0 || !Number.isFinite(row.minimum_order_quantity) || row.minimum_order_quantity <= 0)) {
      throw new Error("invalid supplier price rows");
    }
    const { data, error } = await supabaseAdmin.rpc("procurement_import_supplier_prices_atomic", {
      p_organization_id:organizationId, p_entity_id:entityId, p_supplier_party_id:payload.supplier_party_id,
      p_rows:rows, p_source_attachment_sha256:text(payload.source_attachment_sha256)||null,
      p_source_reference:text(payload.source_reference)||null, p_actor_id:actor,
    });
    if (error) throw error;
    return { success:true, import:data, authorization_effect:"CONFIRMED_OPERATOR_WRITE" };
  }
  return { manifest, execute };
}

export default createSupplierPriceImportCapability;
