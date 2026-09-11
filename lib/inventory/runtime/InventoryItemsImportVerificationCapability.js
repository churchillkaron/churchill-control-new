import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { authoritativeCollectionAssertion } from "@/lib/operator/runtime/AuthoritativeCollectionVerificationRuntime.mjs";

const text=(value,limit=500)=>String(value??"").trim().slice(0,limit);
export function createInventoryItemsImportVerificationCapability(){
  const manifest=defineCapability({domain:"supply-chain",capability:"inventory_items",action:"verifyImport",description:"Verify every inventory item identity returned by one atomic import in the exact organization/entity scope.",permissions:["procurement.manage"],events:[],tags:["supply-chain","inventory","verification","read"],transactional:false,aiEnabled:false,operatorEnabled:true,operatorMode:"read",operatorAutoExecute:true,operatorRequiresConfirmation:false,risk:"low",contextScope:"entity",inputSchema:{type:"object",required:["created_ids","existing_ids"],properties:{created_ids:{type:"array",maxItems:500,items:{type:"string"}},existing_ids:{type:"array",maxItems:500,items:{type:"string"}}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,"procurement.manage");
    const ids=[...new Set([...(payload.created_ids||[]),...(payload.existing_ids||[])].map((v)=>text(v,160)).filter(Boolean))];
    if(!context.organizationId||!context.entityId||!ids.length||ids.length>500) throw new Error("INVENTORY_IMPORT_VERIFY_SCOPE_AND_IDS_REQUIRED");
    const {data,error}=await supabaseAdmin.from("inventory_items").select("id,code,name,is_active,organization_id,entity_id").eq("organization_id",context.organizationId).eq("entity_id",context.entityId).in("id",ids); if(error) throw error;
    const rows=data||[];
    return {success:true,items:rows,business_effect_assertion:authoritativeCollectionAssertion({expected:ids,observed:rows.map((r)=>r.id),collectionIdentity:`inventory_import:${ids.length}`})};
  }
  return {manifest,execute};
}
export default createInventoryItemsImportVerificationCapability;
