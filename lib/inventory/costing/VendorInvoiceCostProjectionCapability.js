import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const REQUIRED_PERMISSION="procurement.manage";
const text=(value)=>String(value??"").trim();
const actorId=(context={})=>text(context.actor?.id||context.actor?.user_id||context.metadata?.actorId);

export function createVendorInvoiceCostProjectionCapability(){
  const manifest=defineCapability({
    domain:"supply-chain",capability:"purchase_costs",action:"apply_vendor_invoice",
    name:"Apply vendor invoice costs",description:"Apply verified vendor-invoice item costs and recalculate affected recipes/dishes.",
    permissions:[REQUIRED_PERMISSION],events:["supply_chain.purchase_costs.updated"],
    tags:["supply-chain","procurement","costing","recipe","vendor-invoice"],transactional:true,
    aiEnabled:false,operatorEnabled:true,operatorMode:"approve",operatorAutoExecute:false,
    operatorRequiresConfirmation:true,risk:"high",reversible:true,contextScope:"entity",
    inputSchema:{type:"object",required:["vendor_invoice_id"],properties:{vendor_invoice_id:{type:"string"}},additionalProperties:false},
  });
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,REQUIRED_PERMISSION);
    const organizationId=text(context.organizationId),entityId=text(context.entityId),actor=actorId(context);
    if(!organizationId||!entityId||!actor) throw new Error("Authenticated organization/entity actor required");
    if(!text(payload.vendor_invoice_id)) throw new Error("vendor_invoice_id required");
    const {data,error}=await supabaseAdmin.rpc("supply_chain_apply_vendor_invoice_costs_atomic",{
      p_organization_id:organizationId,
      p_entity_id:entityId,
      p_vendor_invoice_id:text(payload.vendor_invoice_id),
      p_actor_id:actor,
    });
    if(error) throw error;
    if(!data?.success) throw new Error(data?.error||"vendor invoice cost projection failed");
    return {success:true,projection:data,authorization_effect:"CONFIRMED_OPERATOR_WRITE"};
  }
  return {manifest,execute};
}

export default createVendorInvoiceCostProjectionCapability;
