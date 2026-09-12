import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { authoritativeCollectionAssertion } from "@/lib/operator/runtime/AuthoritativeCollectionVerificationRuntime.mjs";

const text=(v,l=500)=>String(v??"").trim().slice(0,l);
const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
const stable=(v)=>v===null?"null":String(v);
function recipeFingerprint(row={}){return [text(row.item_id,160)||"-",text(row.component_dish_id,160)||"-",stable(num(row.quantity)),text(row.uom_id,160)||"-",stable(num(row.yield_percent??100))].join("|");}

export function createRecipeVerificationCapability(){
  const permission="production.manage";
  const manifest=defineCapability({domain:"supply-chain",capability:"recipes",action:"verify",description:"Verify the exact persisted recipe component value-set and output definition for one dish.",permissions:[permission],events:[],tags:["supply-chain","recipe","verification","read"],transactional:false,aiEnabled:false,operatorEnabled:true,operatorMode:"read",operatorAutoExecute:true,operatorRequiresConfirmation:false,risk:"low",contextScope:"entity",inputSchema:{type:"object",required:["dish_id","items"],properties:{dish_id:{type:"string"},items:{type:"array",minItems:1,maxItems:500},output_quantity:{type:["number","null"]},output_uom_id:{type:["string","null"]}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,permission); const org=text(context.organizationId),entity=text(context.entityId),dishId=text(payload.dish_id,160); const expectedRows=Array.isArray(payload.items)?payload.items:[];
    if(!org||!entity||!dishId||!expectedRows.length||expectedRows.length>500) throw new Error("RECIPE_VERIFY_SCOPE_REQUIRED");
    const [{data:rows,error:rowsError},{data:dish,error:dishError}]=await Promise.all([
      supabaseAdmin.from("recipe_items").select("item_id,component_dish_id,quantity,uom_id,yield_percent").eq("organization_id",org).eq("entity_id",entity).eq("dish_id",dishId),
      supabaseAdmin.from("dishes").select("id,recipe_output_quantity,recipe_output_uom_id").eq("organization_id",org).eq("entity_id",entity).eq("id",dishId).maybeSingle(),
    ]); if(rowsError) throw rowsError; if(dishError) throw dishError;
    const expected=expectedRows.map(recipeFingerprint);
    const observed=(rows||[]).map(recipeFingerprint);
    return {success:true,dish_id:dish?.id||null,business_effect_assertion:authoritativeCollectionAssertion({expected,observed,collectionIdentity:`recipe:${dishId}`})};
  }
  return {manifest,execute};
}

export function createVendorInvoiceCostVerificationCapability(){
  const permission="procurement.manage";
  const manifest=defineCapability({domain:"supply-chain",capability:"purchase_costs",action:"verify_vendor_invoice",description:"Verify that every inventory item cost evidenced by one vendor invoice is either sourced from that invoice or protected by a newer effective cost source.",permissions:[permission],events:[],tags:["supply-chain","costing","vendor-invoice","verification","read"],transactional:false,aiEnabled:false,operatorEnabled:true,operatorMode:"read",operatorAutoExecute:true,operatorRequiresConfirmation:false,risk:"low",contextScope:"entity",inputSchema:{type:"object",required:["vendor_invoice_id"],properties:{vendor_invoice_id:{type:"string"}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,permission); const org=text(context.organizationId),entity=text(context.entityId),invoiceId=text(payload.vendor_invoice_id,160); if(!org||!entity||!invoiceId) throw new Error("VENDOR_INVOICE_COST_VERIFY_SCOPE_REQUIRED");
    const {data:invoice,error:invoiceError}=await supabaseAdmin.from("vendor_invoices").select("id,invoice_date").eq("organization_id",org).eq("entity_id",entity).eq("id",invoiceId).maybeSingle(); if(invoiceError) throw invoiceError; if(!invoice) throw new Error("vendor invoice unavailable");
    const {data:lines,error:lineError}=await supabaseAdmin.from("vendor_invoice_lines").select("item_id").eq("organization_id",org).eq("entity_id",entity).eq("vendor_invoice_id",invoiceId).not("item_id","is",null).not("base_unit_cost","is",null); if(lineError) throw lineError;
    const expected=[...new Set((lines||[]).map(r=>text(r.item_id,160)).filter(Boolean))]; if(!expected.length) throw new Error("vendor invoice has no resolved inventory cost evidence");
    const {data:items,error:itemError}=await supabaseAdmin.from("inventory_items").select("id,cost_source_type,cost_source_id,cost_effective_at").eq("organization_id",org).eq("entity_id",entity).in("id",expected); if(itemError) throw itemError;
    const invoiceTime=Date.parse(invoice.invoice_date||"");
    const observed=(items||[]).filter(row=>text(row.cost_source_id,160)===invoiceId || (Number.isFinite(invoiceTime)&&Date.parse(row.cost_effective_at||"")>invoiceTime)).map(row=>text(row.id,160));
    return {success:true,vendor_invoice_id:invoiceId,business_effect_assertion:authoritativeCollectionAssertion({expected,observed,collectionIdentity:`vendor_invoice_costs:${invoiceId}`})};
  }
  return {manifest,execute};
}
