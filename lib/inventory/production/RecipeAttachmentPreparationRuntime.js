import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveInventoryItemByCode,resolveInventoryUom,resolveFactorToItemBase } from "@/lib/inventory/costing/InventoryUomCostRuntime";
const CONTRACT="AVANTIQO_RECIPE_ATTACHMENT_PREPARATION_V1";
const text=(v,l=1000)=>String(v??"").trim().slice(0,l);
const object=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const list=v=>Array.isArray(v)?v:[];
const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
function evidence(file){return object(object(file.analysis).evidence);}
function fields(file){const e=evidence(file);return {...object(e.key_fields),...object(e.identifiers),...e};}
function val(s,names){const m=new Map(Object.entries(object(s)).map(([k,v])=>[norm(k),v]));for(const n of names){const v=m.get(norm(n));if(v!==undefined&&v!==null&&v!=="")return v;}return null;}
function recipeLike(file){const e=evidence(file),k=norm(`${e.document_type||""} ${e.object_type||""}`);return /recipe|dish_recipe|recipe_card|production_recipe/.test(k);}
function rawIngredients(s){return list(val(s,["ingredients","recipe_items","components","line_items","items"]));}
export async function prepareRecipeAttachment({file={},organizationId,entityId}={}){
  if(!organizationId) throw new Error("organizationId required");
  if(object(file.analysis).status!=="ANALYZED"||!recipeLike(file)) return {contract:CONTRACT,recognized:false,authorization_effect:"NONE"};
  if(!entityId) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which legal entity owns this recipe?",authorization_effect:"NONE"};
  const source=fields(file); const dishId=text(val(source,["dish_id"]),80); const dishCode=text(val(source,["dish_code","menu_item_code","recipe_code"]),160);
  let q=supabaseAdmin.from("dishes").select("id,dish_code,name,cost,price").eq("organization_id",organizationId).eq("entity_id",entityId);
  if(dishId) q=q.eq("id",dishId); else if(dishCode) q=q.eq("dish_code",dishCode); else return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which existing dish should this recipe belong to? Please select the dish or provide its dish code.",authorization_effect:"NONE"};
  const dishResult=await q.limit(2); if(dishResult.error) throw dishResult.error;
  if((dishResult.data||[]).length!==1) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"I cannot match one exact dish from this recipe. Which dish should I use?",authorization_effect:"NONE"};
  const rows=rawIngredients(source); if(!rows.length) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"I cannot verify the recipe ingredients and quantities. Which ingredients should I use?",authorization_effect:"NONE"};
  const prepared=[];
  for(let i=0;i<rows.length;i++){
    const r=object(rows[i]); const code=text(r.item_code||r.sku||r.ingredient_code||r.code,160); const quantity=Number(r.quantity??r.qty??r.amount); const unit=text(r.uom||r.unit||r.unit_of_measure,80); const yieldPercent=Number(r.yield_percent??r.yield??r.usable_yield_percent??100);
    if(!code||!Number.isFinite(quantity)||quantity<=0) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Recipe line ${i+1} needs an exact inventory item code and positive quantity.`,authorization_effect:"NONE"};
    if(!Number.isFinite(yieldPercent)||yieldPercent<=0||yieldPercent>100) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`Recipe line ${i+1} has an invalid usable yield percentage. Use a value above 0 and up to 100.`,authorization_effect:"NONE"};
    const item=await resolveInventoryItemByCode({organizationId,entityId,itemCode:code}); if(!item) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot match recipe line ${i+1} (${code}) to one active inventory item.`,authorization_effect:"NONE"};
    let uom=null; if(unit){uom=await resolveInventoryUom({organizationId,token:unit}); if(!uom) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I cannot resolve the unit ${unit} for ${code}.`,authorization_effect:"NONE"}; const factor=await resolveFactorToItemBase({organizationId,entityId,item,sourceUom:uom}); if(!(factor>0)) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:`I need a unit conversion for ${unit} on ${code} before I can update this recipe.`,authorization_effect:"NONE"};}
    prepared.push({item_id:item.id,quantity,uom_id:uom?.id||item.uom_id||null,item_code:code,yield_percent:yieldPercent});
  }
  const dish=dishResult.data[0]; return {contract:CONTRACT,recognized:true,status:"READY_FOR_REVIEW",clarification_required:false,dish,recipe_items:prepared,import_payload:{dish_id:dish.id,items:prepared.map(({item_id,quantity,uom_id,yield_percent})=>({item_id,quantity,uom_id,yield_percent}))},authorization_effect:"NONE"};
}
export default prepareRecipeAttachment;
