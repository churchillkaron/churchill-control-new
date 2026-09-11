import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { authoritativeValueSetAssertion } from "@/lib/operator/runtime/AuthoritativeValueSetVerificationRuntime.mjs";
const PERMISSION="procurement.manage"; const text=(value,limit=500)=>String(value??"").trim().slice(0,limit);
export function createSupplierPriceImportVerificationCapability(){
  const manifest=defineCapability({domain:"supply-chain",capability:"supplier_prices",action:"verifyImport",description:"Verify every approved supplier-price value in the exact organization/entity/supplier scope.",permissions:[PERMISSION],events:[],tags:["supply-chain","supplier-prices","verification","read"],transactional:false,aiEnabled:false,operatorEnabled:true,operatorMode:"read",operatorAutoExecute:true,operatorRequiresConfirmation:false,risk:"low",contextScope:"entity",inputSchema:{type:"object",required:["supplier_party_id","rows"],properties:{supplier_party_id:{type:"string"},rows:{type:"array",minItems:1,maxItems:500,items:{type:"object"}}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,PERMISSION);
    const supplierId=text(payload.supplier_party_id,160); const expected=(payload.rows||[]).map((row)=>({item_id:text(row?.item_id,160),price:Number(row?.price),minimum_order_quantity:Number(row?.minimum_order_quantity??1)}));
    if(!context.organizationId||!context.entityId||!supplierId||!expected.length||expected.length>500||expected.some((r)=>!r.item_id||!Number.isFinite(r.price)||r.price<0||!Number.isFinite(r.minimum_order_quantity)||r.minimum_order_quantity<=0)||new Set(expected.map((r)=>r.item_id)).size!==expected.length) throw new Error("SUPPLIER_PRICE_VERIFY_SCOPE_AND_ROWS_REQUIRED");
    const ids=expected.map((row)=>row.item_id); const {data,error}=await supabaseAdmin.from("supplier_prices").select("item_id,price,minimum_order_quantity,supplier_party_id,organization_id,entity_id").eq("organization_id",context.organizationId).eq("entity_id",context.entityId).eq("supplier_party_id",supplierId).in("item_id",ids); if(error) throw error;
    const rows=data||[]; return {success:true,supplier_party_id:supplierId,rows,business_effect_assertion:authoritativeValueSetAssertion({expected,observed:rows,valueSetIdentity:`supplier_prices:${supplierId}:${expected.length}`})};
  }
  return {manifest,execute};
}
export default createSupplierPriceImportVerificationCapability;
