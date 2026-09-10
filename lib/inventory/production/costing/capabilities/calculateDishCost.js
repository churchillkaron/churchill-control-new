import { calculateRecipeCost } from "@/lib/inventory/production/recipes/capabilities/calculateRecipeCost";
export default async function calculateDishCost({organizationId,organization_id,entityId,entity_id,dish_id,dishId}={}){
  const result=await calculateRecipeCost({organizationId,organization_id,entityId,entity_id,dishId:dishId||dish_id});
  return {success:true,dish_id:result.dish_id,cost:result.total_cost,price:result.selling_price,profit:result.gross_margin,food_cost_percent:result.food_cost_percent,breakdown:result.breakdown,cost_basis:result.cost_basis};
}
