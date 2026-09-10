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
  assert.match(source,/Never invent an inventory code from an ingredient name/);
});
test('recipe costing and menu engineering use one canonical live recipe model',()=>{
  const costing=read('lib/inventory/production/recipes/capabilities/calculateRecipeCost.js');
  const menu=read('lib/inventory/production/costing/capabilities/runMenuEngineering.js');
  const oldDish=read('lib/inventory/production/costing/capabilities/calculateDishCost.js');
  assert.match(costing,/\.from\("recipe_items"\)/);
  assert.match(costing,/\.from\("inventory_items"\)/);
  assert.match(costing,/inventory_item_uom_conversions/);
  assert.match(costing,/CURRENT_OPERATIONAL_ITEM_COST_WITH_YIELD_V2/);
  assert.match(costing,/purchaseQuantity=\(quantity\*factor\)\/\(yieldPercent\/100\)/);
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
