import { supabaseAdmin } from "@/lib/shared/supabase/admin";
const text=(value)=>String(value??"").trim();
export async function createRecipe({dish_id,items,output_quantity,output_uom_id,organization_id,organizationId,entity_id,entityId,actor_id,actorId}){
  const organization=text(organizationId||organization_id), entity=text(entityId||entity_id), actor=text(actorId||actor_id);
  if(!organization) throw new Error("Organization ID is required");
  if(!entity) throw new Error("Entity ID is required");
  if(!text(dish_id)) throw new Error("Dish ID is required");
  if(!actor) throw new Error("Actor ID is required");
  if(!Array.isArray(items)||!items.length) throw new Error("Recipe items are required");
  const rows=items.map((item)=>({item_id:text(item?.item_id)||null,component_dish_id:text(item?.component_dish_id)||null,quantity:Number(item?.quantity),uom_id:text(item?.uom_id)||null,yield_percent:item?.yield_percent==null?100:Number(item.yield_percent)}));
  if(rows.some((row)=>Boolean(row.item_id)===Boolean(row.component_dish_id)||!Number.isFinite(row.quantity)||row.quantity<=0||!Number.isFinite(row.yield_percent)||row.yield_percent<=0||row.yield_percent>100)) throw new Error("Invalid recipe item or component");
  const outputQuantity=output_quantity==null?null:Number(output_quantity), outputUomId=text(output_uom_id)||null;
  if((outputQuantity==null)!=(outputUomId==null)|| (outputQuantity!=null&&(!Number.isFinite(outputQuantity)||outputQuantity<=0))) throw new Error("Recipe output quantity and UOM must be supplied together");
  const {data,error}=await supabaseAdmin.rpc("production_upsert_recipe_atomic",{p_organization_id:organization,p_entity_id:entity,p_dish_id:dish_id,p_items:rows,p_actor_id:actor,p_output_quantity:outputQuantity,p_output_uom_id:outputUomId});
  if(error) throw error;
  return {success:true,...(data||{})};
}
export default createRecipe;
