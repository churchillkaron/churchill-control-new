import { calculateRecipeCost } from "@/lib/inventory/production/recipes/capabilities/calculateRecipeCost";
export async function runMenuEngineering({organizationId,organization_id,entityId,entity_id,dishId,dish_id,recipeId,popularityScore=0}={}){
  const popularity=Number(popularityScore); if(!Number.isFinite(popularity)||popularity<0||popularity>100) throw new Error("popularityScore must be between 0 and 100");
  const costing=await calculateRecipeCost({organizationId,organization_id,entityId,entity_id,dishId:dishId||dish_id||recipeId});
  const profitability=Number(costing.gross_margin_percent||0); let category="DOG";
  if(popularity>=70&&profitability>=70) category="STAR"; else if(popularity>=70) category="PLOWHORSE"; else if(profitability>=70) category="PUZZLE";
  return {dish_id:costing.dish_id,popularity_score:popularity,profitability_score:profitability,engineering_category:category,food_cost_percent:costing.food_cost_percent,total_cost:costing.total_cost,selling_price:costing.selling_price,cost_basis:costing.cost_basis};
}
export default runMenuEngineering;
