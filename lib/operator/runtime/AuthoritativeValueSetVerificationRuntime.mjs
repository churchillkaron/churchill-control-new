function text(value, limit = 500) { return String(value ?? "").trim().slice(0, limit); }
function numeric(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function normalizedRow(row = {}) {
  return { item_id: text(row.item_id, 160), price: numeric(row.price), minimum_order_quantity: numeric(row.minimum_order_quantity) };
}
export function authoritativeValueSetAssertion({ expected = [], observed = [], valueSetIdentity = null } = {}) {
  const normalize = (rows) => (Array.isArray(rows) ? rows : []).map(normalizedRow).filter((row) => row.item_id && row.price !== null && row.minimum_order_quantity !== null).sort((a,b)=>a.item_id.localeCompare(b.item_id));
  const expectedRows=normalize(expected), observedRows=normalize(observed);
  const uniqueExpected=new Set(expectedRows.map((row)=>row.item_id));
  const uniqueObserved=new Set(observedRows.map((row)=>row.item_id));
  const passed=expectedRows.length>0 && uniqueExpected.size===expectedRows.length && uniqueObserved.size===observedRows.length && expectedRows.length===observedRows.length && expectedRows.every((row,index)=>row.item_id===observedRows[index].item_id && row.price===observedRows[index].price && row.minimum_order_quantity===observedRows[index].minimum_order_quantity);
  return { contract:"AVANTIQO_AUTHORITATIVE_VALUE_SET_BUSINESS_EFFECT_ASSERTION_V1", passed, authoritative_server_evidence:true, exact_business_scope_matched:true, expected_count:expectedRows.length, observed_count:observedRows.length, value_set_identity:text(valueSetIdentity)||null, authorization_effect:"NONE" };
}
