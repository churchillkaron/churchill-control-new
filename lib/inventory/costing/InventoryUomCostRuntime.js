import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text=(value,limit=500)=>String(value??"").trim().slice(0,limit);
const normalized=(value)=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,"");

export async function resolveInventoryItemByCode({organizationId,entityId,itemCode}) {
  const code=text(itemCode,160);
  if(!organizationId||!entityId||!code) return null;
  const {data,error}=await supabaseAdmin.from("inventory_items")
    .select("id,organization_id,entity_id,name,code,uom_id,cost,is_active")
    .eq("organization_id",organizationId).eq("entity_id",entityId)
    .eq("code",code).eq("is_active",true).limit(2);
  if(error) throw error;
  return (data||[]).length===1?data[0]:null;
}

export async function resolveInventoryUom({organizationId,token}) {
  const needle=normalized(token);
  if(!needle) return null;
  const {data,error}=await supabaseAdmin.from("inventory_uoms")
    .select("id,organization_id,name,abbreviation,dimension,factor_to_base,is_system")
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);
  if(error) throw error;
  const matches=(data||[]).filter((row)=>
    normalized(row.abbreviation)===needle||normalized(row.name)===needle);
  return matches.length===1?matches[0]:null;
}
async function loadUom(id) {
  if(!id) return null;
  const {data,error}=await supabaseAdmin.from("inventory_uoms")
    .select("id,organization_id,name,abbreviation,dimension,factor_to_base,is_system")
    .eq("id",id).maybeSingle();
  if(error) throw error;
  return data||null;
}


export async function resolveFactorBetweenUoms({organizationId,sourceUom,targetUom}) {
  if(!sourceUom?.id||!targetUom?.id) return null;
  if(String(sourceUom.id)===String(targetUom.id)) return 1;
  const sourceDimension=text(sourceUom.dimension).toUpperCase();
  const targetDimension=text(targetUom.dimension).toUpperCase();
  const sourceFactor=Number(sourceUom.factor_to_base);
  const targetFactor=Number(targetUom.factor_to_base);
  if(sourceDimension&&sourceDimension===targetDimension&&sourceDimension!=="PACKAGE"&&
    Number.isFinite(sourceFactor)&&sourceFactor>0&&Number.isFinite(targetFactor)&&targetFactor>0) {
    return sourceFactor/targetFactor;
  }
  return null;
}

export async function resolveFactorToItemBase({organizationId,entityId,item,sourceUom}) {
  if(!item?.id||!item?.uom_id||!sourceUom?.id) return null;
  if(String(item.uom_id)===String(sourceUom.id)) return 1;
  const baseUom=await loadUom(item.uom_id);
  if(!baseUom) return null;
  const sourceDimension=text(sourceUom.dimension).toUpperCase();
  const baseDimension=text(baseUom.dimension).toUpperCase();
  const sourceFactor=Number(sourceUom.factor_to_base);
  const baseFactor=Number(baseUom.factor_to_base);
  if(sourceDimension&&sourceDimension===baseDimension&&sourceDimension!=="PACKAGE"&&
    Number.isFinite(sourceFactor)&&sourceFactor>0&&Number.isFinite(baseFactor)&&baseFactor>0) {
    return sourceFactor/baseFactor;
  }
  const {data,error}=await supabaseAdmin.from("inventory_item_uom_conversions")
    .select("factor_to_item_base").eq("organization_id",organizationId)
    .eq("entity_id",entityId).eq("item_id",item.id).eq("from_uom_id",sourceUom.id).maybeSingle();
  if(error) throw error;
  const factor=Number(data?.factor_to_item_base);
  return Number.isFinite(factor)&&factor>0?factor:null;
}
export async function resolveBaseUnitCost({organizationId,entityId,itemCode,sourceUomToken,unitPrice}) {
  const price=Number(unitPrice);
  if(!Number.isFinite(price)||price<0) return {status:"INVALID_PRICE"};
  const item=await resolveInventoryItemByCode({organizationId,entityId,itemCode});
  if(!item) return {status:"ITEM_UNRESOLVED",item_code:text(itemCode,160)};
  const sourceUom=await resolveInventoryUom({organizationId,token:sourceUomToken});
  if(!sourceUom) return {status:"UOM_UNRESOLVED",item_id:item.id,item_code:item.code};
  const factor=await resolveFactorToItemBase({organizationId,entityId,item,sourceUom});
  if(!factor) return {status:"CONVERSION_UNRESOLVED",item_id:item.id,item_code:item.code,source_uom_id:sourceUom.id};
  return {
    status:"RESOLVED",item_id:item.id,item_code:item.code,item_name:item.name,
    source_uom_id:sourceUom.id,base_uom_id:item.uom_id,
    factor_to_item_base:factor,source_unit_price:price,
    base_unit_cost:Number((price/factor).toFixed(8)),
  };
}

export default resolveBaseUnitCost;