import { supabaseAdmin } from "@/lib/shared/supabase/admin";
const text=v=>String(v??"").trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
export async function calculateRecipeCost({organizationId,organization_id,entityId,entity_id,dishId,dish_id,recipeId,laborCost=0,overheadCost=0,sellingPrice=null}={}){
  const org=text(organizationId||organization_id),entity=text(entityId||entity_id),dishKey=text(dishId||dish_id||recipeId);
  if(!org) throw new Error("organizationId required"); if(!entity) throw new Error("entityId required"); if(!dishKey) throw new Error("dishId required");
  const dishResult=await supabaseAdmin.from("dishes").select("id,name,price,cost,dish_code,organization_id,entity_id").eq("organization_id",org).eq("entity_id",entity).eq("id",dishKey).maybeSingle();
  if(dishResult.error) throw dishResult.error; if(!dishResult.data) throw new Error("dish unavailable for organization/entity");
  const recipeResult=await supabaseAdmin.from("recipe_items").select("id,item_id,quantity,uom_id,unit").eq("organization_id",org).eq("entity_id",entity).eq("dish_id",dishKey);
  if(recipeResult.error) throw recipeResult.error; const rows=recipeResult.data||[]; if(!rows.length) throw new Error("dish has no recipe components");
  const itemIds=[...new Set(rows.map(r=>text(r.item_id)).filter(Boolean))];
  const itemsResult=await supabaseAdmin.from("inventory_items").select("id,name,code,cost,uom_id,is_active").eq("organization_id",org).eq("entity_id",entity).in("id",itemIds);
  if(itemsResult.error) throw itemsResult.error; const items=new Map((itemsResult.data||[]).map(r=>[text(r.id),r]));
  const uomIds=[...new Set([...rows.map(r=>text(r.uom_id)),...(itemsResult.data||[]).map(r=>text(r.uom_id))].filter(Boolean))];
  const uomResult=uomIds.length?await supabaseAdmin.from("inventory_uoms").select("id,name,abbreviation,dimension,factor_to_base,organization_id").in("id",uomIds):{data:[],error:null};
  if(uomResult.error) throw uomResult.error; const uoms=new Map((uomResult.data||[]).map(r=>[text(r.id),r]));
  const conversionResult=await supabaseAdmin.from("inventory_item_uom_conversions").select("item_id,from_uom_id,factor_to_item_base").eq("organization_id",org).eq("entity_id",entity).in("item_id",itemIds);
  if(conversionResult.error) throw conversionResult.error; const conversions=new Map((conversionResult.data||[]).map(r=>[`${r.item_id}|${r.from_uom_id}`,num(r.factor_to_item_base)]));
  let ingredientCost=0; const breakdown=[];
  for(const row of rows){const item=items.get(text(row.item_id)); if(!item||item.is_active===false) throw new Error("recipe inventory item unavailable"); let factor=1;
    if(row.uom_id&&item.uom_id&&text(row.uom_id)!==text(item.uom_id)){const source=uoms.get(text(row.uom_id)),base=uoms.get(text(item.uom_id)); factor=0;
      if(source&&base&&source.dimension===base.dimension&&source.dimension&&source.dimension!=="PACKAGE"&&num(source.factor_to_base)>0&&num(base.factor_to_base)>0) factor=num(source.factor_to_base)/num(base.factor_to_base);
      if(!(factor>0)) factor=conversions.get(`${item.id}|${row.uom_id}`)||0; if(!(factor>0)) throw new Error(`recipe UOM conversion unresolved for item ${item.code||item.id}`);}
    const quantity=num(row.quantity),unitCost=num(item.cost),componentCost=quantity*factor*unitCost; ingredientCost+=componentCost;
    breakdown.push({item_id:item.id,item_code:item.code||null,item_name:item.name,quantity,uom_id:row.uom_id||item.uom_id||null,factor_to_item_base:factor,base_unit_cost:unitCost,component_cost:Number(componentCost.toFixed(4))});}
  const labor=num(laborCost),overhead=num(overheadCost),total=ingredientCost+labor+overhead; const price=sellingPrice==null?num(dishResult.data.price):num(sellingPrice); const margin=price-total;
  return {dish_id:dishKey,dish_code:dishResult.data.dish_code||null,dish_name:dishResult.data.name,ingredient_cost:Number(ingredientCost.toFixed(4)),labor_cost:labor,overhead_cost:overhead,total_cost:Number(total.toFixed(4)),selling_price:price,gross_margin:Number(margin.toFixed(4)),gross_margin_percent:price>0?Number(((margin/price)*100).toFixed(2)):0,food_cost_percent:price>0?Number(((total/price)*100).toFixed(2)):0,breakdown,cost_basis:"CURRENT_OPERATIONAL_ITEM_COST_V1"};
}
export default calculateRecipeCost;
