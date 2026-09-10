import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT="AVANTIQO_SUPPLIER_PRICE_ATTACHMENT_PREPARATION_V1";
const text=(value,limit=1000)=>String(value??"").trim().slice(0,limit);
const object=(value)=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
const list=(value)=>Array.isArray(value)?value:[];
const normalized=(value)=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
function evidence(file={}){return object(object(file.analysis).evidence);}
function fields(file={}){const e=evidence(file);return {...object(e.key_fields),...object(e.identifiers),...e};}
function value(source,names){const index=new Map(Object.entries(object(source)).map(([k,v])=>[normalized(k),v]));for(const n of names){const v=index.get(normalized(n));if(v!==undefined&&v!==null&&v!=="")return v;}return null;}
function priceListLike(file={}){const e=evidence(file);const kind=normalized(`${e.document_type||""} ${e.object_type||""}`);return /supplier.*price|vendor.*price|price_list|price list/.test(kind);}
function rawRows(source={}){return list(value(source,["price_rows","supplier_prices","line_items","items","rows"]));}
function normalizedRows(source={}){
  return rawRows(source).map((entry,index)=>{const row=object(entry);const price=Number(row.price??row.unit_price??row.unit_cost??row.cost);const moq=Number(row.minimum_order_quantity??row.moq??1);return {
    row_number:index+1,item_code:text(row.item_code||row.sku||row.product_code||row.code,160),
    item_name:text(row.item_name||row.name||row.description,500),price:Number.isFinite(price)?price:null,
    minimum_order_quantity:Number.isFinite(moq)&&moq>0?moq:null,currency:text(row.currency||row.currency_code,12).toUpperCase()||null,
  };});
}
export async function prepareSupplierPriceAttachment({file={},organizationId,entityId}={}){
  if(!organizationId) throw new Error("organizationId required");
  if(object(file.analysis).status!=="ANALYZED"||!priceListLike(file)) return {contract:CONTRACT,recognized:false,authorization_effect:"NONE"};
  if(!entityId) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which legal entity should own these supplier prices?",authorization_effect:"NONE"};

  const match=object(file.business_match);
  const supplierCandidate=list(match.candidates).find((item)=>item?.record_type==="supplier");
  if(match.status==="AMBIGUOUS_MATCH") return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:text(match.clarification_question)||"Which supplier does this price list belong to?",authorization_effect:"NONE"};
  if(match.status!=="UNIQUE_MATCH"||!supplierCandidate?.record_id) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"Which existing supplier does this price list belong to?",authorization_effect:"NONE"};

  const source=fields(file);const rows=normalizedRows(source);
  if(!rows.length) return {contract:CONTRACT,recognized:true,status:"CLARIFICATION_REQUIRED",clarification_required:true,clarification_question:"I could not find supplier price rows. Which item codes and prices should I import?",authorization_effect:"NONE"};
  const codes=[...new Set(rows.map((row)=>row.item_code).filter(Boolean))];
  const itemResult=codes.length?await supabaseAdmin.from("inventory_items").select("id,code,name,is_active").eq("organization_id",organizationId).eq("entity_id",entityId).in("code",codes):{data:[],error:null};
  if(itemResult.error) throw itemResult.error;
  const itemsByCode=new Map((itemResult.data||[]).filter((row)=>row.is_active!==false).map((row)=>[text(row.code,160),row]));
  const prepared=rows.map((row)=>{const item=itemsByCode.get(row.item_code);const invalid=!row.item_code||!item||row.price===null||row.price<0||row.minimum_order_quantity===null;return {...row,item_id:item?.id||null,item_label:item?.name||row.item_name||row.item_code,disposition:invalid?"INVALID":"PENDING"};});
  const itemIds=prepared.map((row)=>row.item_id).filter(Boolean);
  const existingResult=itemIds.length?await supabaseAdmin.from("supplier_prices")
    .select("id,item_id,price,minimum_order_quantity")
    .eq("organization_id",organizationId).eq("entity_id",entityId)
    .eq("supplier_party_id",supplierCandidate.record_id).in("item_id",itemIds):{data:[],error:null};
  if(existingResult.error) throw existingResult.error;
  const existingByItem=new Map((existingResult.data||[]).map((row)=>[row.item_id,row]));
  const reviewed=prepared.map((row)=>{
    if(row.disposition==="INVALID") return row;
    const current=existingByItem.get(row.item_id);
    if(!current) return {...row,disposition:"NEW",current_price:null,current_minimum_order_quantity:null};
    const same=Number(current.price)===Number(row.price)&&Number(current.minimum_order_quantity||1)===Number(row.minimum_order_quantity||1);
    return {...row,disposition:same?"UNCHANGED":"CHANGED",current_price:Number(current.price),current_minimum_order_quantity:Number(current.minimum_order_quantity||1)};
  });
  const invalid=reviewed.filter((row)=>row.disposition==="INVALID");
  const actionable=reviewed.filter((row)=>["NEW","CHANGED"].includes(row.disposition));
  const sourceReference=text(value(source,["price_list_number","reference_number","document_number","effective_date"]),160)||null;
  return {contract:CONTRACT,recognized:true,status:invalid.length?"CLARIFICATION_REQUIRED":"READY_FOR_REVIEW",
    supplier:{record_id:supplierCandidate.record_id,label:supplierCandidate.label},rows:reviewed,
    row_count:reviewed.length,new_count:reviewed.filter((r)=>r.disposition==="NEW").length,
    changed_count:reviewed.filter((r)=>r.disposition==="CHANGED").length,unchanged_count:reviewed.filter((r)=>r.disposition==="UNCHANGED").length,
    invalid_count:invalid.length,clarification_required:invalid.length>0,
    clarification_question:invalid.length?"Some price-list rows do not have an exact active inventory item code or a valid price. Which item codes/prices should I use?":null,
    import_payload:invalid.length?null:{supplier_party_id:supplierCandidate.record_id,
      rows:actionable.map((r)=>({item_id:r.item_id,price:r.price,minimum_order_quantity:r.minimum_order_quantity})),
      source_attachment_sha256:text(file.sha256,128)||null,source_reference:sourceReference},authorization_effect:"NONE"};
}
export default prepareSupplierPriceAttachment;
