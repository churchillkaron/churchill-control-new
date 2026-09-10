import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PERMISSION="production.manage";
const text=(value)=>String(value??"").trim();
const actorId=(context)=>text(context?.actor?.id||context?.actor?.user_id||context?.metadata?.actorId);

export function createProductionBatchCapability(){
  const manifest=defineCapability({domain:"supply-chain",capability:"production_batches",action:"create",name:"Create prepared production batch",description:"Create a costed BATCH preparation from the canonical recursive recipe graph and record its usable output quantity, remaining quantity, UOM and cost per output unit.",permissions:[PERMISSION],events:["supply_chain.production_batch.created"],tags:["supply-chain","production","batch","preparation","costing"],transactional:true,aiEnabled:false,operatorEnabled:true,operatorMode:"approve",operatorAutoExecute:false,operatorRequiresConfirmation:true,risk:"high",reversible:true,contextScope:"entity",inputSchema:{type:"object",required:["dish_id","recipe_batch_count"],properties:{dish_id:{type:"string"},recipe_batch_count:{type:"number",exclusiveMinimum:0},reference_id:{type:["string","null"]}},additionalProperties:false}});
  async function execute({context,payload={}}){
    await requireExecutionPermission(context,PERMISSION);
    const organizationId=text(context.organizationId),entityId=text(context.entityId),actor=actorId(context),dishId=text(payload.dish_id),batchCount=Number(payload.recipe_batch_count);
    if(!organizationId||!entityId||!actor) throw new Error("Authenticated organization/entity actor required");
    if(!dishId||!Number.isFinite(batchCount)||batchCount<=0) throw new Error("dish_id and positive recipe_batch_count required");
    const {data,error}=await supabaseAdmin.rpc("production_create_costed_batch_atomic",{p_organization_id:organizationId,p_entity_id:entityId,p_dish_id:dishId,p_recipe_batch_count:batchCount,p_reference_id:text(payload.reference_id)||null,p_actor_id:actor});
    if(error) throw error;
    return {success:true,batch:data,authorization_effect:"CONFIRMED_OPERATOR_WRITE"};
  }
  return {manifest,execute};
}
export default createProductionBatchCapability;
