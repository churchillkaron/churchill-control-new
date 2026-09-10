import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
const PERMISSION="production.manage";
const text=v=>String(v??"").trim();
const actorId=c=>text(c?.actor?.id||c?.actor?.user_id||c?.metadata?.actorId);
export function createRecipeUpsertCapability(){
  const manifest=defineCapability({domain:"supply-chain",capability:"recipes",action:"upsert",name:"Create or update recipe",description:"Atomically replace a dish recipe and recalculate its food cost from entity-scoped inventory costs.",permissions:[PERMISSION],events:["supply_chain.recipe.updated"],tags:["supply-chain","production","recipe","costing"],transactional:true,aiEnabled:false,operatorEnabled:true,operatorMode:"approve",operatorAutoExecute:false,operatorRequiresConfirmation:true,risk:"high",reversible:true,contextScope:"entity",inputSchema:{type:"object",required:["dish_id","items"],properties:{dish_id:{type:"string"},items:{type:"array",minItems:1,maxItems:500}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,PERMISSION);
    const organizationId=text(context.organizationId),entityId=text(context.entityId),actor=actorId(context);
    if(!organizationId||!entityId||!actor) throw new Error("Authenticated organization/entity actor required");
    if(!text(payload.dish_id)||!Array.isArray(payload.items)||!payload.items.length) throw new Error("dish_id and recipe items required");
    const rows=payload.items.map(row=>({item_id:text(row?.item_id),quantity:Number(row?.quantity),uom_id:text(row?.uom_id)||null}));
    if(rows.some(row=>!row.item_id||!Number.isFinite(row.quantity)||row.quantity<=0)) throw new Error("invalid recipe items");
    const {data,error}=await supabaseAdmin.rpc("production_upsert_recipe_atomic",{p_organization_id:organizationId,p_entity_id:entityId,p_dish_id:payload.dish_id,p_items:rows,p_actor_id:actor});
    if(error) throw error;
    return {success:true,recipe:data,authorization_effect:"CONFIRMED_OPERATOR_WRITE"};
  }
  return {manifest,execute};
}
export default createRecipeUpsertCapability;
