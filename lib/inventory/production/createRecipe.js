import { supabaseAdmin } from "@/lib/shared/supabase/admin";
const text=(value)=>String(value??"").trim();
export async function createRecipe({dish_id,items,organization_id,organizationId,entity_id,entityId,actor_id,actorId}){
  const organization=text(organizationId||organization_id), entity=text(entityId||entity_id), actor=text(actorId||actor_id);
  if(!organization) throw new Error("Organization ID is required");
  if(!entity) throw new Error("Entity ID is required");
  if(!text(dish_id)) throw new Error("Dish ID is required");
  if(!actor) throw new Error("Actor ID is required");
  if(!Array.isArray(items)||!items.length) throw new Error("Recipe items are required");
  const rows=items.map((item)=>({item_id:text(item?.item_id),quantity:Number(item?.quantity),uom_id:text(item?.uom_id)||null}));
  if(rows.some((row)=>!row.item_id||!Number.isFinite(row.quantity)||row.quantity<=0)) throw new Error("Invalid recipe item");
  const {data,error}=await supabaseAdmin.rpc("production_upsert_recipe_atomic",{p_organization_id:organization,p_entity_id:entity,p_dish_id:dish_id,p_items:rows,p_actor_id:actor});
  if(error) throw error;
  return {success:true,...(data||{})};
}
export default createRecipe;
