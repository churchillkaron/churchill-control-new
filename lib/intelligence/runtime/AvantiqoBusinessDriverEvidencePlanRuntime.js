import { listOperatorFastReads } from "../../operator/runtime/OperatorFastReadIndex.js";
import { businessDriverDiagnosisPlan } from "./AvantiqoBusinessDriverGraphRuntime.js";

export const AVANTIQO_BUSINESS_DRIVER_EVIDENCE_PLAN_CONTRACT = "AVANTIQO_BUSINESS_DRIVER_EVIDENCE_PLAN_V1";

const DRIVER_READ_HINTS = Object.freeze({
  cash:["finance.cash_management.read","finance.trial_balance.read","finance.customer_invoices.read"],
  cash_inflows:["finance.cash_management.read","finance.customer_invoices.read"],
  cash_outflows:["finance.cash_management.read","finance.trial_balance.read"],
  receivables_collection:["finance.customer_invoices.read","finance.cash_management.read"],
  payables_timing:["finance.cash_management.read","finance.trial_balance.read"],
  demand:["solutions.hotel_bookings.read","finance.customer_invoices.read","commercial.quotations.read"],
  lead_volume:["commercial.quotations.read","commercial.customers.read"],
  conversion_rate:["commercial.quotations.read","commercial.customers.read","finance.customer_invoices.read"],
  staffing:["people.attendance.read","people.employees.read","operations.command_center.read"],
  staff_coverage:["people.attendance.read","people.employees.read","operations.command_center.read"],
  attendance_reliability:["people.attendance.read"],
  turnover:["people.employees.read"],
  inventory_health:["supply_chain.stock_position.read","supply_chain.inventory_items.read"],
  inventory_availability:["supply_chain.stock_position.read","supply_chain.inventory_items.read"],
  customer_retention:["commercial.customers.read","finance.customer_invoices.read"],
  repeat_customer_rate:["commercial.customers.read","finance.customer_invoices.read"],
  customer_acquisition:["commercial.customers.read","commercial.quotations.read","finance.customer_invoices.read"],
  service_quality:["operations.command_center.read","commercial.customers.read"],
  service_failures:["operations.command_center.read"],
  response_time:["operations.command_center.read"],
  project_delivery:["operations.command_center.read"],
  project_delay:["operations.command_center.read"],
  task_blockers:["operations.command_center.read"],
  resource_capacity:["operations.command_center.read","people.attendance.read","people.employees.read"],
  supplier_delay:["operations.command_center.read","supply_chain.inventory_items.read"],
  profit:["finance.trial_balance.read","finance.cash_management.read"],
  cash:["finance.cash_management.read","finance.customer_invoices.read","finance.trial_balance.read"],
  cash_inflows:["finance.cash_management.read","finance.customer_invoices.read"], cash_outflows:["finance.cash_management.read","finance.trial_balance.read"],
  receivables_collection:["finance.customer_invoices.read","finance.cash_management.read"], payables_timing:["finance.cash_management.read","finance.trial_balance.read"],
  demand:["solutions.hotel_bookings.read","finance.customer_invoices.read","commercial.customers.read"], lead_volume:["commercial.customers.read","commercial.quotations.read"], conversion_rate:["commercial.quotations.read","commercial.customers.read","finance.customer_invoices.read"],
  staffing:["people.attendance.read","people.employees.read","operations.command_center.read"], staff_coverage:["people.attendance.read","people.employees.read","operations.command_center.read"], attendance_reliability:["people.attendance.read"], turnover:["people.employees.read"],
  inventory_health:["supply_chain.stock_position.read","supply_chain.inventory_items.read"], inventory_availability:["supply_chain.stock_position.read","supply_chain.inventory_items.read"],
  customer_retention:["commercial.customers.read","finance.customer_invoices.read"], repeat_customer_rate:["commercial.customers.read","finance.customer_invoices.read"], customer_acquisition:["commercial.customers.read","commercial.quotations.read","finance.customer_invoices.read"],
  service_quality:["operations.command_center.read","commercial.customers.read"], service_failures:["operations.command_center.read"], response_time:["operations.command_center.read"],
  project_delivery:["operations.command_center.read"], project_delay:["operations.command_center.read"], task_blockers:["operations.command_center.read"], resource_capacity:["operations.command_center.read","people.attendance.read","people.employees.read"], supplier_delay:["operations.command_center.read"],
  revenue:["finance.customer_invoices.read","finance.trial_balance.read"],
  volume:["solutions.hotel_bookings.read","finance.customer_invoices.read"],
  price:["finance.customer_invoices.read","commercial.quotations.read"],
  mix:["finance.customer_invoices.read","commercial.customers.read","solutions.hotel_bookings.read"],
  discounts_refunds:["finance.customer_invoices.read","finance.trial_balance.read"],
  cost_total:["finance.trial_balance.read","finance.cash_management.read"],
  cogs:["finance.trial_balance.read","supply_chain.inventory_items.read","supply_chain.stock_position.read"],
  purchase_price:["supply_chain.inventory_items.read"],
  recipe_usage:["supply_chain.inventory_items.read","supply_chain.stock_position.read"],
  inventory_variance:["supply_chain.stock_position.read","supply_chain.inventory_items.read"],
  labor:["finance.trial_balance.read","people.attendance.read","people.employees.read"],
  hours:["people.attendance.read"],
  wage_rate:["people.employees.read","finance.trial_balance.read"],
  overtime_productivity:["people.attendance.read","operations.command_center.read"],
  occupancy_cost:["finance.trial_balance.read"],
  utilities:["finance.trial_balance.read"], electricity:["finance.trial_balance.read"], water:["finance.trial_balance.read"], gas_fuel:["finance.trial_balance.read"],
  marketing_cost:["finance.trial_balance.read"], fees_finance:["finance.trial_balance.read","finance.cash_management.read"], waste_loss:["finance.trial_balance.read","supply_chain.stock_position.read"],
});

const EXTERNAL_EVIDENCE = Object.freeze({
  weather:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"weather and rainfall matching the diagnosis period and business location"},
  seasonality:{freshness:"PERIOD_MATCHED",query:"calendar, holiday and seasonal demand pattern for the diagnosis period"},
  tourism_demand:{freshness:"PERIOD_MATCHED",query:"official tourism arrivals, occupancy or destination demand for the business location"},
  local_events:{freshness:"PERIOD_MATCHED",query:"material local events that could affect demand during the diagnosis period"},
  competitor_pressure:{freshness:"CURRENT_AND_PERIOD_MATCHED",query:"competitor openings, closures, promotions, pricing or major activity"},
  reviews_reputation:{freshness:"PERIOD_MATCHED",query:"review volume, rating and reputation change over the diagnosis period"},
  market_pricing:{freshness:"CURRENT_AND_PERIOD_MATCHED",query:"comparable market pricing and material price changes"},
  supplier_market_prices:{freshness:"PERIOD_MATCHED",query:"relevant supplier or commodity market price changes"},
  fx:{freshness:"PERIOD_MATCHED",query:"relevant foreign exchange rates for the diagnosis period"},
  inflation:{freshness:"PERIOD_MATCHED",query:"official inflation or producer price evidence relevant to the business"},
  labor_market:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"labor availability and wage-market evidence"},
  utility_tariffs:{freshness:"PERIOD_MATCHED",query:"official electricity and water tariff changes"},
  energy_prices:{freshness:"PERIOD_MATCHED",query:"fuel, gas or energy price changes"},
  ad_market_prices:{freshness:"PERIOD_MATCHED",query:"advertising auction or media cost changes where material"},
  interest_rates:{freshness:"PERIOD_MATCHED",query:"official interest-rate changes affecting financing costs"},
  customer_payment_behavior:{freshness:"PERIOD_MATCHED",query:"customer payment behavior or payment-term change relevant to collection speed"},
  supplier_terms:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"supplier credit terms and payment-term changes"},
  supplier_disruption:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"supplier availability, disruption and lead-time changes"},
  fuel_prices:{freshness:"PERIOD_MATCHED",query:"fuel price changes relevant to field operations"},
  customer_payment_behavior:{freshness:"PERIOD_MATCHED",query:"customer payment timing and collection behavior for the diagnosis period"},
  supplier_terms:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"supplier credit terms, payment terms and material changes"},
  supplier_disruption:{freshness:"CURRENT_OR_PERIOD_MATCHED",query:"supplier outages, shortages, delivery delays or lead-time disruptions"},
});

function unique(v){return [...new Set((Array.isArray(v)?v:[]).filter(Boolean))]}
export function buildBusinessDriverEvidencePlan({metric="profit",industry="general",solution_ids=[],available_reads=null}={}){
  const diagnosis=businessDriverDiagnosisPlan({metric,industry,solution_ids});
  const reads=Array.isArray(available_reads)?available_reads:listOperatorFastReads();
  const byKey=new Map(reads.map(r=>[r.key,r]));
  const internal=diagnosis.internal_driver_ids.map((driver_id,index)=>{
    const hints=DRIVER_READ_HINTS[driver_id]||[];
    const registered=hints.filter(k=>byKey.has(k));
    return {driver_id,priority_rank:index+1,registered_read_capability_keys:registered,coverage_status:registered.length?"REGISTERED_READ_AVAILABLE":"AUTHORITATIVE_READ_GAP",requires_live_internal_evidence:true};
  });
  const external=diagnosis.external_context_ids.map((context_id)=>({context_id,...(EXTERNAL_EVIDENCE[context_id]||{freshness:"CURRENT_OR_PERIOD_MATCHED",query:`current external evidence for ${context_id}`}),evidence_status:"FRESH_EXTERNAL_EVIDENCE_REQUIRED",internal_product_truth_effect:"NONE",authority_effect:"NONE"}));
  const gaps=internal.filter(x=>x.coverage_status==="AUTHORITATIVE_READ_GAP").map(x=>x.driver_id);
  return {contract:AVANTIQO_BUSINESS_DRIVER_EVIDENCE_PLAN_CONTRACT,metric:diagnosis.metric,industry:diagnosis.industry,industry_specific:diagnosis.industry_specific,internal_evidence_plan:internal,external_evidence_plan:external,internal_driver_gap_ids:gaps,registered_internal_driver_coverage:Number(((internal.length-gaps.length)/Math.max(1,internal.length)).toFixed(4)),execution_policy:{internal_authoritative_reads_first:true,external_evidence_only_after_internal_variance:true,external_evidence_is_not_internal_product_truth:true,missing_read_must_be_reported_not_invented:true,causal_claim_requires_more_than_correlation:true,planning_only:true,authority_effect:"NONE"},authority_effect:"NONE"};
}

export const AvantiqoBusinessDriverEvidencePlanRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DRIVER_EVIDENCE_PLAN_CONTRACT,build:buildBusinessDriverEvidencePlan});
