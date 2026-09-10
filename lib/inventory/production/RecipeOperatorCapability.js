import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
const PERMISSION="production.manage";
const text=v=>String(v??"").trim();
const actorId=c=>text(c?.actor?.id||c?.actor?.user_id||c?.metadata?.actorId);
export function createRecipeUpsertCapability(){
  const manifest=defineCapability({domain:"supply-chain",capability:"recipes",action:"upsert",name:"Create or update recipe",description:"Atomically replace a dish recipe, support reusable preparations/sub-recipes, and recalculate canonical recursive food cost.",permissions:[PERMISSION],events:["supply_chain.recipe.updated"],tags:["supply-chain","production","recipe","costing"],transactional:true,aiEnabled:false,operatorEnabled:true,operatorMode:"approve",operatorAutoExecute:false,operatorRequiresConfirmation:true,risk:"high",reversible:true,contextScope:"entity",inputSchema:{type:"object",required:["dish_id","items"],properties:{dish_id:{type:"string"},output_quantity:{type:["number","null"]},output_uom_id:{type:["string","null"]},items:{type:"array",minItems:1,maxItems:500}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,PERMISSION);
    const organizationId=text(context.organizationId),entityId=text(context.entityId),actor=actorId(context);
    if(!organizationId||!entityId||!actor) throw new Error("Authenticated organization/entity actor required");
    if(!text(payload.dish_id)||!Array.isArray(payload.items)||!payload.items.length) throw new Error("dish_id and recipe items required");
    const rows=payload.items.map(row=>({item_id:text(row?.item_id)||null,component_dish_id:text(row?.component_dish_id)||null,quantity:Number(row?.quantity),uom_id:text(row?.uom_id)||null,yield_percent:row?.yield_percent==null?100:Number(row.yield_percent)}));
    if(rows.some(row=>Boolean(row.item_id)===Boolean(row.component_dish_id)||!Number.isFinite(row.quantity)||row.quantity<=0||!Number.isFinite(row.yield_percent)||row.yield_percent<=0||row.yield_percent>100)) throw new Error("invalid recipe items or components");
    const outputQuantity=payload.output_quantity==null?null:Number(payload.output_quantity),outputUomId=text(payload.output_uom_id)||null;
    if((outputQuantity==null)!=(outputUomId==null)||(outputQuantity!=null&&(!Number.isFinite(outputQuantity)||outputQuantity<=0))) throw new Error("recipe output quantity and UOM must be supplied together");
    const {data,error}=await supabaseAdmin.rpc("production_upsert_recipe_atomic",{p_organization_id:organizationId,p_entity_id:entityId,p_dish_id:payload.dish_id,p_items:rows,p_actor_id:actor,p_output_quantity:outputQuantity,p_output_uom_id:outputUomId});
    if(error) throw error;
    return {success:true,recipe:data,authorization_effect:"CONFIRMED_OPERATOR_WRITE"};
  }
  return {manifest,execute};
}
export default createRecipeUpsertCapability;
