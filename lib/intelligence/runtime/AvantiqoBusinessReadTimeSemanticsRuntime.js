export const AVANTIQO_BUSINESS_READ_TIME_SEMANTICS_CONTRACT = "AVANTIQO_BUSINESS_READ_TIME_SEMANTICS_V1";

const REGISTRY=Object.freeze({
  "finance.profit_loss.read":{time_semantics:"PERIOD_AWARE",selectors:["period_id","start_date","end_date"],comparison_safe:true},
  "finance.trial_balance.read":{time_semantics:"PERIOD_AWARE",selectors:["period_id","start_date","end_date"],comparison_safe:true},
  "people.attendance.read":{time_semantics:"MONTH_AWARE",selectors:["month"],comparison_safe:false,reason:"PERIOD_ID_DOES_NOT_DRIVE_MONTH_SELECTOR"},
  "finance.customer_invoices.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"NO_HISTORICAL_PERIOD_FILTER"},
  "finance.cash_management.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:["today"],comparison_safe:false,reason:"USES_CURRENT_DATE_AND_CURRENT_BALANCES"},
  "solutions.hotel_bookings.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"NO_HISTORICAL_PERIOD_FILTER"},
  "commercial.quotations.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"NO_HISTORICAL_PERIOD_FILTER"},
  "commercial.customers.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"MASTER_DATA_CURRENT_STATE"},
  "supply_chain.stock_position.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"CURRENT_LEDGER_POSITION_WITHOUT_AS_OF_SELECTOR"},
  "supply_chain.inventory_items.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"MASTER_DATA_CURRENT_STATE"},
  "people.employees.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"MASTER_DATA_CURRENT_STATE"},
  "compliance.work_permits.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"CURRENT_COMPLIANCE_AND_EXPIRY_STATE"},
  "operations.command_center.read":{time_semantics:"CURRENT_STATE_ONLY",selectors:[],comparison_safe:false,reason:"CURRENT_OPERATIONAL_STATE"},
});

export function businessReadTimeSemantics(capabilityKey){
  const key=String(capabilityKey??"").trim();
  const row=REGISTRY[key]||{time_semantics:"UNKNOWN",selectors:[],comparison_safe:false,reason:"TIME_SEMANTICS_NOT_REGISTERED"};
  return {contract:AVANTIQO_BUSINESS_READ_TIME_SEMANTICS_CONTRACT,capability_key:key||null,...row,authority_effect:"NONE"};
}
export function isBusinessReadPeriodComparisonSafe(capabilityKey){return businessReadTimeSemantics(capabilityKey).comparison_safe===true;}
export const AvantiqoBusinessReadTimeSemanticsRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_READ_TIME_SEMANTICS_CONTRACT,resolve:businessReadTimeSemantics,isPeriodComparisonSafe:isBusinessReadPeriodComparisonSafe});
