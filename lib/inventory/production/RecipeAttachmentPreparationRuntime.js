import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveInventoryItemByCode,resolveInventoryUom,resolveFactorToItemBase,resolveFactorBetweenUoms } from "@/lib/inventory/costing/InventoryUomCostRuntime";
const CONTRACT="AVANTIQO_RECIPE_ATTACHMENT_PREPARATION_V2";
const text=(v,l=1000)=>String(v??"").trim().slice(0,l);
const object=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const list=v=>Array.isArray(v)?v:[];
const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
function evidence(file){return object(object(file.analysis).evidence);}
function fields(file){const e=evidence(file);return {...object(e.key_fields),...object(e.identifiers),...e};}
function val(s,names){const m=new Map(Object.entries(object(s)).map(([k,v])=>[norm(k),v]));for(const n of names){const v=m.get(norm(n));if(v!==undefined&&v!==null&&v!=="")return v;}return null;}
function recipeLike(file){const e=evidence(file),k=norm(`${e.document_type||""} ${e.object_type||""}`);return /recipe|dish_recipe|recipe_card|production_recipe/.test(k);}
function rawIngredients(s){return list(val(s,["ingredients","recipe_items","components","line_items","items"]));}
async function exactDishByCode({organizationId,entityId,dishCode}){
  const {data,error}=await supabaseAdmin.from("dishes").select("id,dish_code,name,cost,price,production_type,recipe_output_quantity,recipe_output_uom_id").eq("organization_id",organizationId).eq("entity_id",entityId).eq("dish_code",dishCode).limit(2);
  if(error) throw error;
  return (data||[]).length===1?data[0]:null;
}
export async function prepareRecipeAttachment({file={},organizationId,entityId}={}){
  if(!organizationId) throw new Error("organizationId required");
  if(object(file.analysis).status!=="ANALYZED"||!recipeLike(file)) return {contract:CONTRACT,recognized:false,authorization_effect:"NONE"};
  if(!entityId) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which legal entity owns this recipe?",authorization_effect:"NONE"};
  const source=fields(file); const dishId=text(val(source,["dish_id"]),80); const dishCode=text(val(source,["dish_code","menu_item_code","recipe_code"]),160);
  let q=supabaseAdmin.from("dishes").select("id,dish_code,name,cost,price,production_type,recipe_output_quantity,recipe_output_uom_id").eq("organization_id",organizationId).eq("entity_id",entityId);
  if(dishId) q=q.eq("id",dishId); else if(dishCode) q=q.eq("dish_code",dishCode); else return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which existing dish should this recipe belong to? Please select the dish or provide its dish code.",authorization_effect:"NONE"};
  const dishResult=await q.limit(2); if(dishResult.error) throw dishResult.error;
  if((dishResult.data||[]).length!==1) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"I cannot match one exact dish from this recipe. Which dish should I use?",authorization_effect:"NONE"};
  const dish=dishResult.data[0];
  const outputQuantityRaw=val(source,["recipe_output_quantity","output_quantity","batch_yield_quantity","prepared_yield_quantity"]);
  const outputUomRaw=text(val(source,["recipe_output_uom","output_uom","batch_yield_uom","prepared_yield_uom"]),80);
  const outputQuantity=outputQuantityRaw==null?null:Number(outputQuantityRaw);
  let outputUom=null;
  if(outputQuantityRaw!=null||outputUomRaw){
    if(!Number.isFinite(outputQuantity)||outputQuantity<=0||!outputUomRaw) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"This batch/preparation needs both a positive output quantity and an output unit.",authorization_effect:"NONE"};
    outputUom=await resolveInventoryUom({organizationId,token:outputUomRaw});
    if(!outputUom) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot resolve the recipe output unit ${outputUomRaw}.`,authorization_effect:"NONE"};
  }
  const rows=rawIngredients(source); if(!rows.length) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"I cannot verify the recipe ingredients and quantities. Which ingredients should I use?",authorization_effect:"NONE"};
  const prepared=[];
  for(let i=0;i<rows.length;i++){
    const r=object(rows[i]); const code=text(r.item_code||r.sku||r.ingredient_code||r.code,160); const componentCode=text(r.component_dish_code||r.component_recipe_code||r.sub_recipe_code||r.preparation_code,160); const quantity=Number(r.quantity??r.qty??r.amount); const unit=text(r.uom||r.unit||r.unit_of_measure,80); const yieldPercent=Number(r.yield_percent??r.yield??r.usable_yield_percent??100);
    if(Boolean(code)===Boolean(componentCode)) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Recipe line ${i+1} must identify exactly one inventory item code or reusable preparation/sub-recipe code.`,authorization_effect:"NONE"};
    if(!Number.isFinite(quantity)||quantity<=0) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Recipe line ${i+1} needs a positive quantity.`,authorization_effect:"NONE"};
    if(!Number.isFinite(yieldPercent)||yieldPercent<=0||yieldPercent>100) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Recipe line ${i+1} has an invalid usable yield percentage. Use a value above 0 and up to 100.`,authorization_effect:"NONE"};
    if(code){
      const item=await resolveInventoryItemByCode({organizationId,entityId,itemCode:code}); if(!item) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot match recipe line ${i+1} (${code}) to one active inventory item.`,authorization_effect:"NONE"};
      let uom=null; if(unit){uom=await resolveInventoryUom({organizationId,token:unit}); if(!uom) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot resolve the unit ${unit} for ${code}.`,authorization_effect:"NONE"}; const factor=await resolveFactorToItemBase({organizationId,entityId,item,sourceUom:uom}); if(!(factor>0)) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I need a unit conversion for ${unit} on ${code} before I can update this recipe.`,authorization_effect:"NONE"};}
      prepared.push({item_id:item.id,component_dish_id:null,quantity,uom_id:uom?.id||item.uom_id||null,item_code:code,yield_percent:yieldPercent});
      continue;
    }
    if(!unit) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Reusable preparation line ${i+1} (${componentCode}) needs an explicit unit from the source document.`,authorization_effect:"NONE"};
    const component=await exactDishByCode({organizationId,entityId,dishCode:componentCode});
    if(!component) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot match reusable preparation/sub-recipe ${componentCode} to one exact dish code.`,authorization_effect:"NONE"};
    if(component.id===dish.id) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"A recipe cannot contain itself as a reusable component.",authorization_effect:"NONE"};
    if(!(Number(component.recipe_output_quantity)>0)||!component.recipe_output_uom_id) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Reusable preparation ${componentCode} needs its batch output quantity and UOM defined before it can be consumed by another recipe.`,authorization_effect:"NONE"};
    const sourceUom=await resolveInventoryUom({organizationId,token:unit}); if(!sourceUom) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot resolve the unit ${unit} for ${componentCode}.`,authorization_effect:"NONE"};
    const {data:targetUom,error:targetError}=await supabaseAdmin.from("inventory_uoms").select("id,organization_id,name,abbreviation,dimension,factor_to_base,is_system").eq("id",component.recipe_output_uom_id).maybeSingle(); if(targetError) throw targetError;
    const factor=await resolveFactorBetweenUoms({organizationId,sourceUom,targetUom}); if(!(factor>0)) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot convert ${unit} into the output UOM for reusable preparation ${componentCode}.`,authorization_effect:"NONE"};
    prepared.push({item_id:null,component_dish_id:component.id,component_dish_code:componentCode,quantity,uom_id:sourceUom.id,yield_percent:yieldPercent});
  }
  return {contract:CONTRACT,recognized:true,status:"READY_FOR_REVIEW",clarification_required:false,dish,recipe_output:outputUom?{quantity:outputQuantity,uom_id:outputUom.id,uom:outputUom.abbreviation||outputUom.name}:null,recipe_items:prepared,import_payload:{dish_id:dish.id,output_quantity:outputQuantity,output_uom_id:outputUom?.id||null,items:prepared.map(({item_id,component_dish_id,quantity,uom_id,yield_percent})=>({item_id,component_dish_id,quantity,uom_id,yield_percent}))},authorization_effect:"NONE"};
}
export default prepareRecipeAttachment;
