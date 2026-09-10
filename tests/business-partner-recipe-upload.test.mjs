import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const read = (file) => readFileSync(file, 'utf8');
const capability = { key:'supply-chain.recipes.upsert', mode:'write', requires_confirmation:true, auto_execute:false };

function readyRecipe(){
  return { name:'recipe.pdf', prepared_candidate:{ type:'recipe', recognized:true, status:'READY_FOR_REVIEW',
    dish:{id:'dish-1',dish_code:'D-001',name:'Beef Burger'},
    recipe_items:[{item_id:'item-1',quantity:150,uom_id:'uom-g',item_code:'BEEF-001',yield_percent:82}],
    import_payload:{dish_id:'dish-1',items:[{item_id:'item-1',quantity:150,uom_id:'uom-g',yield_percent:82}]}, authorization_effect:'NONE' } };
}

test('ready recipe upload stages governed atomic recipe replacement',()=>{
  const attachments=[readyRecipe()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments,'Update this recipe'),true);
  const result=resolvePreparedAttachmentReflex({message:'Update this recipe',attachments,capabilities:[capability]});
  assert.equal(result.intent,'execute');
  assert.equal(result.execution.capability_key,'supply-chain.recipes.upsert');
  assert.equal(result.execution.payload.dish_id,'dish-1');
  assert.equal(result.execution.payload.items[0].yield_percent,82);
  assert.match(result.response_text,/requires your confirmation/i);
});

test('unresolved dish or ingredient never stages recipe write',()=>{
  const file=readyRecipe(); file.prepared_candidate.status='CLARIFICATION_REQUIRED'; file.prepared_candidate.import_payload=null;
  file.prepared_candidate.clarification_question='Which existing dish should this recipe belong to?';
  const result=resolvePreparedAttachmentReflex({message:'Update this recipe',attachments:[file],capabilities:[capability]});
  assert.equal(result.intent,'clarify'); assert.equal(result.execution.capability_key,null);
});
test('recipe transaction is entity scoped atomic and UOM fail closed',()=>{
  const sql=read('supabase/migrations/20260910164500_production_recipe_atomic_upsert.sql');
  assert.match(sql,/production_upsert_recipe_atomic/);
  assert.match(sql,/organization_id=p_organization_id and d.entity_id=p_entity_id/);
  assert.match(sql,/recipe UOM conversion unresolved/);
  assert.match(sql,/delete from public\.recipe_items/);
  assert.match(sql,/insert into public\.recipe_items/);
  assert.match(sql,/update public\.dishes set cost/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/grant execute .*service_role/s);
});

test('recipe capability requires production.manage and confirmation',()=>{
  const source=read('lib/inventory/production/RecipeOperatorCapability.js');
  assert.match(source,/production\.manage/);
  assert.match(source,/operatorRequiresConfirmation:true/);
  assert.match(source,/production_upsert_recipe_atomic/);
});

test('recipe preparer requires strong dish target exact item codes and UOM conversion',()=>{
  const source=read('lib/inventory/production/RecipeAttachmentPreparationRuntime.js');
  assert.match(source,/dish_code/);
  assert.match(source,/Please select the dish or provide its dish code/);
  assert.match(source,/item_code\|\|r\.sku\|\|r\.ingredient_code/);
  assert.match(source,/resolveFactorToItemBase/);
  assert.match(source,/yield_percent/);
  assert.match(source,/usable yield percentage/);
  assert.doesNotMatch(source,/\.ilike\(/);
});

test('manual recipe API converges on atomic writer and production permission',()=>{
  const api=read('app/api/production/recipes/route.js');
  const writer=read('lib/inventory/production/createRecipe.js');
  assert.match(api,/permissionKey:"production\.manage"/);
  assert.match(api,/entityId required/);
  assert.match(writer,/production_upsert_recipe_atomic/);
  assert.match(writer,/yield_percent/);
  assert.doesNotMatch(writer,/\.from\("recipe_items"\)\.delete/);
});

test('owned attachment analysis preserves recipe SKU quantity and UOM without inventing codes',()=>{
  const source=read('lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js');
  assert.match(source,/For recipes or recipe cards/);
  assert.match(source,/Never invent an inventory or component recipe code from a name/);
});
test('recipe costing and menu engineering use one canonical live recipe model',()=>{
  const costing=read('lib/inventory/production/recipes/capabilities/calculateRecipeCost.js');
  const menu=read('lib/inventory/production/costing/capabilities/runMenuEngineering.js');
  const oldDish=read('lib/inventory/production/costing/capabilities/calculateDishCost.js');
  assert.match(costing,/\.from\("recipe_items"\)/);
  assert.match(costing,/\.from\("inventory_items"\)/);
  assert.match(costing,/inventory_item_uom_conversions/);
  assert.match(costing,/CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3/);
  assert.match(costing,/purchaseQuantity = \(quantity \* factor\) \/ \(yieldPercent \/ 100\)/);
  assert.doesNotMatch(costing,/recipe_cost_snapshots/);
  assert.doesNotMatch(costing,/weighted_average_cost/);
  assert.doesNotMatch(oldDish,/ingredients\s*\(/);
  assert.match(menu,/calculateRecipeCost/);
  assert.doesNotMatch(menu,/menu_engineering_scores/);
  assert.doesNotMatch(menu,/recipe_cost_snapshots/);
});

test('costing routes accept canonical dish id while preserving legacy request alias',()=>{
  const calculate=read('app/api/production/recipe-costing/calculate/route.js');
  const menu=read('app/api/production/recipe-costing/menu-engineering/route.js');
  assert.match(calculate,/body\.dishId \|\| body\.dish_id \|\| body\.recipeId \|\| body\.recipe_id/);
  assert.match(menu,/body\.dishId \|\| body\.dish_id \|\| body\.recipeId \|\| body\.recipe_id/);
});

test('recipe yield migration grosses usable quantity into purchase-cost quantity and remains atomic',()=>{
  const sql=read('supabase/migrations/20260910173000_production_recipe_yield_costing.sql');
  assert.match(sql,/add column if not exists yield_percent/);
  assert.match(sql,/yield_percent > 0 and yield_percent <= 100/);
  assert.match(sql,/\(v_quantity\*v_factor\)\/\(v_yield_percent\/100\)/);
  assert.match(sql,/insert into public\.recipe_items[\s\S]*yield_percent/);
  assert.match(sql,/update public\.dishes set cost=round\(v_total,4\)/);
  assert.match(sql,/CURRENT_OPERATIONAL_ITEM_COST_WITH_YIELD_V2/);
});

test('nested recipe graph supports reusable preparations without a second costing model',()=>{
  const costing=read('lib/inventory/production/recipes/capabilities/calculateRecipeCost.js');
  assert.match(costing,/component_dish_id/);
  assert.match(costing,/component_recipe/);
  assert.match(costing,/recipe_output_quantity/);
  assert.match(costing,/recipe_output_uom_id/);
  assert.match(costing,/recipe component cycle detected/);
  assert.match(costing,/recipe component depth exceeds 12/);
  assert.match(costing,/CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3/);
  assert.doesNotMatch(costing,/prepared_inventory/);
});

test('recipe component migration is tenant scoped recursive and fail closed',()=>{
  const sql=read('supabase/migrations/20260910180000_production_recipe_components.sql');
  assert.match(sql,/add column if not exists recipe_output_quantity/);
  assert.match(sql,/add column if not exists recipe_output_uom_id/);
  assert.match(sql,/add column if not exists component_dish_id/);
  assert.match(sql,/production_recipe_cost_total_internal/);
  assert.match(sql,/p_path\|\|p_dish_id/);
  assert.match(sql,/recipe component cycle detected/);
  assert.match(sql,/component recipe unavailable for organization\/entity/);
  assert.match(sql,/component recipe .* needs output quantity and UOM/);
  assert.match(sql,/drop function if exists public\.production_upsert_recipe_atomic\(uuid,uuid,uuid,jsonb,uuid\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on function[\s\S]*from public,anon,authenticated/);
  assert.match(sql,/grant execute on function[\s\S]*to service_role/);
});

test('recipe uploads preserve exact reusable preparation references and batch output',()=>{
  const preparer=read('lib/inventory/production/RecipeAttachmentPreparationRuntime.js');
  const analysis=read('lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js');
  assert.match(preparer,/component_recipe_code\|\|r\.sub_recipe_code\|\|r\.preparation_code/);
  assert.match(preparer,/Boolean\(code\)===Boolean\(componentCode\)/);
  assert.match(preparer,/recipe_output_quantity/);
  assert.match(preparer,/resolveFactorBetweenUoms/);
  assert.doesNotMatch(preparer,/\.ilike\(/);
  assert.match(analysis,/component_recipe_code\/sub_recipe_code\/preparation_code/);
  assert.match(analysis,/Never invent an inventory or component recipe code from a name/);
  assert.match(analysis,/never invent a yield percentage or batch output/i);
});

test('manual recipe writer uses one RPC for inventory and component lines plus output yield',()=>{
  const writer=read('lib/inventory/production/createRecipe.js');
  const capabilitySource=read('lib/inventory/production/RecipeOperatorCapability.js');
  const route=read('app/api/production/recipes/route.js');
  assert.match(writer,/component_dish_id/);
  assert.match(writer,/p_output_quantity/);
  assert.match(writer,/p_output_uom_id/);
  assert.match(capabilitySource,/component_dish_id/);
  assert.match(capabilitySource,/reusable preparations\/sub-recipes/);
  assert.match(route,/output_quantity: body\.output_quantity/);
  assert.match(route,/output_uom_id: body\.output_uom_id/);
});

test('prepared inventory converges on costed BATCH production instead of legacy prepared_inventory',()=>{
  const prepared=read('lib/inventory/production/prepared/listPreparedInventory.js');
  const batches=read('lib/inventory/production/batches/listProductionBatches.js');
  assert.match(prepared,/\.from\("production_batches"\)/);
  assert.match(prepared,/production_type === "BATCH"/);
  assert.match(prepared,/remaining_quantity/);
  assert.doesNotMatch(prepared,/\.from\("prepared_inventory"\)/);
  assert.match(batches,/entity_id/);
  assert.match(batches,/recipe_batch_count/);
  assert.match(batches,/cost_basis/);
});

test('costed batch creation is governed and derives cost from the canonical recipe graph',()=>{
  const capabilitySource=read('lib/inventory/production/ProductionBatchOperatorCapability.js');
  const domain=read('lib/inventory/runtime/InventoryDomainRuntime.js');
  const sql=read('supabase/migrations/20260910180000_production_recipe_components.sql');
  assert.match(capabilitySource,/production\.manage/);
  assert.match(capabilitySource,/operatorRequiresConfirmation:true/);
  assert.match(capabilitySource,/production_create_costed_batch_atomic/);
  assert.match(domain,/production_batches/);
  assert.match(domain,/createProductionBatchCapability/);
  assert.match(sql,/v_total_cost := public\.production_recipe_cost_total_internal/);
  assert.match(sql,/v_output_quantity := v_dish\.recipe_output_quantity\*p_recipe_batch_count/);
  assert.match(sql,/remaining_quantity,total_cost,cost_per_unit/);
  assert.match(sql,/production_type<>'BATCH'/);
  assert.match(sql,/CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3/);
});

test('recipe listing exposes component recipes and batch output metadata in the canonical UI model',()=>{
  const source=read('lib/inventory/production/recipes/listProductionRecipes.js');
  assert.match(source,/component_dish_id/);
  assert.match(source,/COMPONENT_RECIPE/);
  assert.match(source,/recipe_output_quantity/);
  assert.match(source,/recipe_output_uom_id/);
  assert.match(source,/yield_percent/);
  assert.match(source,/entity_id/);
});
