import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_GOODS_RECEIPT_ATTACHMENT_PREPARATION_V1";
function text(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function norm(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function evidence(file = {}) { return object(object(file.analysis).evidence); }
function flat(file = {}) { const e = evidence(file); return { ...object(e.key_fields), ...object(e.identifiers), ...e }; }
function value(source, names) { const idx = new Map(Object.entries(object(source)).map(([k,v]) => [norm(k),v])); for (const n of names) { const v=idx.get(norm(n)); if (text(v)) return v; } return null; }
function kind(file = {}) { const e=evidence(file); return norm(`${e.document_type || ""} ${e.object_type || ""}`); }
function receivingLike(file = {}) { return /delivery note|delivery receipt|goods receipt|packing list/.test(kind(file)); }
function qty(v) { const n=Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
function deliveryLines(source = {}) {
  return list(value(source,["line_items","items","lines","delivered_items"]))
    .map((r) => { const x=object(r); return { code:text(x.item_code||x.sku||x.product_code,160)||null, name:text(x.item_name||x.description||x.name,500)||null, quantity:qty(x.received_qty??x.delivered_qty??x.quantity??x.qty) }; })
    .filter((r) => (r.code || r.name) && r.quantity);
}
async function loadPo({ organizationId, entityId, poNumber }) {
  let q=supabaseAdmin.from("purchase_orders").select("id,po_number,status,entity_id,supplier_party_id,warehouse_id").eq("organization_id",organizationId).eq("po_number",poNumber).limit(3);
  if (entityId) q=q.eq("entity_id",entityId);
  const res=await q; if(res.error) throw res.error;
  if((res.data||[]).length!==1) return { po:null, ambiguous:(res.data||[]).length>1 };
  const po=res.data[0];
  const items=await supabaseAdmin.from("purchase_order_items").select("id,item_id,item_name,qty,received_qty").eq("purchase_order_id",po.id).order("id");
  if(items.error) throw items.error;
  const itemIds=(items.data||[]).map(r=>r.item_id).filter(Boolean);
  let codes=new Map();
  if(itemIds.length){ const ir=await supabaseAdmin.from("inventory_items").select("id,code,name").eq("organization_id",organizationId).in("id",itemIds); if(ir.error) throw ir.error; codes=new Map((ir.data||[]).map(r=>[r.id,r])); }
  return { po, ambiguous:false, items:(items.data||[]).map(r=>({...r,item_code:codes.get(r.item_id)?.code||null,item_master_name:codes.get(r.item_id)?.name||null})) };
}
function exactFullMatch(delivery, poItems) {
  if(!delivery.length || delivery.length!==poItems.length) return false;
  const unused=new Set(poItems.map((_,i)=>i));
  for(const row of delivery){
    const matches=[...unused].filter(i=>{ const p=poItems[i]; const codeMatch=row.code && p.item_code && text(row.code)===text(p.item_code); const nameMatch=!row.code && row.name && norm(row.name)===norm(p.item_name||p.item_master_name); return (codeMatch||nameMatch) && Math.abs(Number(p.qty||0)-Number(row.quantity||0))<0.000001; });
    if(matches.length!==1) return false; unused.delete(matches[0]);
  }
  return unused.size===0;
}
export async function prepareGoodsReceiptAttachment({ file={}, organizationId, entityId }={}) {
  if(!organizationId) throw new Error("organizationId required");
  if(object(file.analysis).status!=="ANALYZED" || !receivingLike(file)) return { contract:CONTRACT, recognized:false, authorization_effect:"NONE" };
  if(!entityId) return { contract:CONTRACT, recognized:true, status:"CLARIFICATION_REQUIRED", clarification_required:true, clarification_question:"Which legal entity is receiving this delivery?", authorization_effect:"NONE" };
  const source=flat(file); const poNumber=text(value(source,["purchase_order_number","po_number","po_no","purchase_order_reference"]),160);
  if(!poNumber) return { contract:CONTRACT, recognized:true, status:"CLARIFICATION_REQUIRED", clarification_required:true, clarification_question:"Which purchase order does this delivery belong to?", authorization_effect:"NONE" };
  const loaded=await loadPo({organizationId,entityId,poNumber});
  if(loaded.ambiguous) return { contract:CONTRACT, recognized:true, status:"CLARIFICATION_REQUIRED", clarification_required:true, clarification_question:`More than one purchase order matches ${poNumber}. Which one should I use?`, authorization_effect:"NONE" };
  if(!loaded.po) return { contract:CONTRACT, recognized:true, status:"CLARIFICATION_REQUIRED", clarification_required:true, clarification_question:`I cannot find purchase order ${poNumber} in this legal entity. Should I file this delivery note as evidence only?`, authorization_effect:"NONE" };
  if(text(loaded.po.status).toUpperCase()==="RECEIVED") return { contract:CONTRACT, recognized:true, status:"ALREADY_RECEIVED", purchase_order:loaded.po, clarification_required:false, authorization_effect:"NONE" };
  if(text(loaded.po.status).toUpperCase()!=="APPROVED") return { contract:CONTRACT, recognized:true, status:"CLARIFICATION_REQUIRED", purchase_order:loaded.po, clarification_required:true, clarification_question:`Purchase order ${poNumber} is ${text(loaded.po.status)||"not approved"}. It must be approved before receiving.`, authorization_effect:"NONE" };
  const lines=deliveryLines(source); const full=exactFullMatch(lines,loaded.items);
  if(!full) return { contract:CONTRACT, recognized:true, status:"PARTIAL_OR_UNVERIFIED", purchase_order:loaded.po, delivery_lines:lines, clarification_required:true, clarification_question:"This delivery does not exactly prove the full approved purchase order quantities. Review it as a partial/exception receipt before stock is moved.", authorization_effect:"NONE" };
  return { contract:CONTRACT, recognized:true, status:"READY_FOR_REVIEW", purchase_order:loaded.po, delivery_lines:lines, clarification_required:false, import_payload:{purchase_order_id:loaded.po.id}, authorization_effect:"NONE" };
}
export default prepareGoodsReceiptAttachment;
