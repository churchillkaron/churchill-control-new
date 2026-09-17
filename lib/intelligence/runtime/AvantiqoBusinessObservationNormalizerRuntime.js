export const AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT = "AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_V1";

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const list = (v) => Array.isArray(v) ? v : [];
const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const text = (v, n=160) => String(v ?? "").trim().slice(0,n);
const sum = (rows, pick) => rows.reduce((a,r) => a + (finite(pick(r)) ?? 0), 0);

function currencyRows(payload={}) {
  return list(payload.currency_positions).map(r => ({
    key: text(r.currency_code || "UNSPECIFIED",40),
    values: {
      cash_position: finite(r.bank_position),
      scheduled_position_7d: finite(r.scheduled_position_7d),
      scheduled_position_30d: finite(r.scheduled_position_30d),
      receivables_overdue: finite(r.overdue_receipts),
      payables_overdue: finite(r.overdue_payments),
    },
  }));
}

function summarize(capabilityKey, raw) {
  const payload = obj(raw?.result ?? raw);
  if (payload.success === false) return { status:"INVALID_EVIDENCE", series:[] };
  switch (capabilityKey) {
    case "finance.cash_management.read":
      return { status:"OK", series: currencyRows(payload) };
    case "finance.profit_loss.read": {
      const summary=obj(payload?.document?.summary);
      const revenue=finite(summary.revenue), cogs=finite(summary.cogs), expenses=finite(summary.expenses), netProfit=finite(summary.netProfit);
      const currency=text(payload?.document?.currency?.code || "UNSPECIFIED",40);
      return { status:"OK", series:[{key:currency,values:{recognized_revenue:revenue,cogs_amount:cogs,operating_expenses:expenses,total_cost:cogs!==null&&expenses!==null?cogs+expenses:null,net_profit:netProfit}}] };
    }
    case "supply_chain.stock_position.read":
      return { status:"OK", series:[{key:"count",values:{inventory_quantity:finite(payload?.metrics?.totalQuantity),inventory_item_count:finite(payload?.metrics?.itemCount)}}] };
    case "people.attendance.read":
      return { status:"OK", series:[{key:"count",values:{staff_count:list(payload.staff).length,scheduled_shifts:list(payload.schedules).length,worked_shifts:list(payload.shifts).length,attendance_records:list(payload.attendance).length,late_shifts:list(payload.lateShifts).length,pending_shifts:list(payload.pendingShifts).length}}] };
    case "finance.customer_invoices.read": {
      const rows=list(payload.invoices);
      return { status:"OK", series:[{key:"count",values:{invoice_count:rows.length,invoice_open_count:rows.filter(r=>String(r.status||"").toUpperCase()==="OPEN").length,invoice_paid_count:rows.filter(r=>String(r.status||"").toUpperCase()==="PAID").length,total_invoiced:sum(rows,r=>r.total_amount),total_outstanding:sum(rows,r=>r.outstanding_amount ?? r.outstanding_balance)}}] };
    }
    case "solutions.hotel_bookings.read":
      return { status:"OK", series:[{key:"count",values:{booking_count:list(payload.bookings).length}}] };
    case "commercial.customers.read":
      return { status:"OK", series:[{key:"count",values:{customer_count:finite(payload.rowCount) ?? list(payload.customers || payload.rows).length}}] };
    case "commercial.quotations.read":
      return { status:"OK", series:[{key:"count",values:{quotation_count:list(payload.rows).length}}] };
    case "supply_chain.inventory_items.read":
      return { status:"OK", series:[{key:"count",values:{inventory_item_count:list(payload.items).length}}] };
    default:
      return { status:"NO_KNOWN_NORMALIZER", series:[] };
  }
}

export function normalizeBusinessObservationPair({capability_key, baseline, current, scope={}}={}) {
  const capabilityKey=text(capability_key,300);
  if(!capabilityKey) throw new Error("AVANTIQO_BUSINESS_OBSERVATION_CAPABILITY_REQUIRED");
  const organizationId=text(scope.organization_id,180)||null;
  const entityId=text(scope.entity_id,180)||null;
  const baselinePeriodId=text(scope.baseline_period_id,180)||null;
  const currentPeriodId=text(scope.current_period_id,180)||null;
  if(!baselinePeriodId || !currentPeriodId) return {contract:AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,capability_key:capabilityKey,status:"EVIDENCE_GAP",reason:"COMPARISON_PERIOD_SCOPE_REQUIRED",observations:[],authority_effect:"NONE"};
  if(baselinePeriodId===currentPeriodId) return {contract:AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,capability_key:capabilityKey,status:"EVIDENCE_GAP",reason:"COMPARISON_PERIODS_MUST_DIFFER",observations:[],authority_effect:"NONE"};
  const before=summarize(capabilityKey, baseline);
  const after=summarize(capabilityKey, current);
  if(before.status!=="OK" || after.status!=="OK") return {contract:AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,capability_key:capabilityKey,status:"EVIDENCE_GAP",reason:before.status!=="OK"?before.status:after.status,observations:[],authority_effect:"NONE"};
  const currentByKey=new Map(after.series.map(s=>[s.key,s]));
  const observations=[];
  for(const a of before.series){
    const b=currentByKey.get(a.key); if(!b) continue;
    for(const [measure,baseValue] of Object.entries(a.values||{})){
      const actualValue=finite(b.values?.[measure]); const baselineValue=finite(baseValue);
      if(baselineValue===null || actualValue===null) continue;
      observations.push({measure_id:measure,dimension_key:a.key,baseline_value:baselineValue,actual_value:actualValue,delta:actualValue-baselineValue,source_capability_key:capabilityKey,scope:{organization_id:organizationId,entity_id:entityId,baseline_period_id:baselinePeriodId,current_period_id:currentPeriodId},evidence_status:"OBSERVED_COMPARABLE",authority_effect:"NONE"});
    }
  }
  return {contract:AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,capability_key:capabilityKey,status:observations.length?"OBSERVATIONS_READY":"EVIDENCE_GAP",reason:observations.length?null:"NO_COMPARABLE_MEASURES",observations,comparison_policy:{same_capability_required:true,same_organization_required:true,same_entity_required_when_entity_scoped:true,different_periods_required:true,same_scope_required:true,currency_not_combined:true,missing_measure_not_invented:true,raw_live_result_is_not_itself_a_baseline:true},authority_effect:"NONE"};
}

export const AvantiqoBusinessObservationNormalizerRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_OBSERVATION_NORMALIZER_CONTRACT,normalizePair:normalizeBusinessObservationPair});
