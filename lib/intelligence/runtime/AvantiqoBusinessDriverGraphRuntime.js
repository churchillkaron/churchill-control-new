export const AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT="AVANTIQO_BUSINESS_DRIVER_GRAPH_V1";
const INTERNAL="INTERNAL",EXTERNAL="EXTERNAL",DERIVED="DERIVED";
const nodes=Object.freeze([
 {id:"profit",label:"Profit",source:DERIVED,children:["revenue","cost_total"]},
 {id:"cash",label:"Cash position / cash flow",source:DERIVED,children:["cash_inflows","cash_outflows","receivables_collection","payables_timing"]},
 {id:"cash_inflows",label:"Cash inflows",source:INTERNAL,children:["revenue","receivables_collection"]},
 {id:"cash_outflows",label:"Cash outflows",source:INTERNAL,children:["cost_total","payables_timing"]},
 {id:"receivables_collection",label:"Receivables collection speed",source:INTERNAL,external:["customer_payment_behavior","interest_rates"]},
 {id:"payables_timing",label:"Supplier payable timing",source:INTERNAL,external:["supplier_terms","interest_rates"]},
 {id:"demand",label:"Demand / booking demand",source:DERIVED,children:["volume","lead_volume","conversion_rate"],external:["weather","seasonality","tourism_demand","local_events","competitor_pressure","reviews_reputation"]},
 {id:"lead_volume",label:"Lead / enquiry volume",source:INTERNAL,external:["seasonality","tourism_demand","local_events","competitor_pressure","ad_market_prices"]},
 {id:"conversion_rate",label:"Lead-to-customer conversion",source:INTERNAL,external:["competitor_pressure","reviews_reputation","market_pricing"]},
 {id:"staffing",label:"Staffing health",source:DERIVED,children:["staff_coverage","attendance_reliability","overtime_productivity","turnover"]},
 {id:"staff_coverage",label:"Roster / staffing coverage",source:INTERNAL},
 {id:"attendance_reliability",label:"Attendance reliability",source:INTERNAL},
 {id:"turnover",label:"Employee turnover / retention",source:INTERNAL,external:["labor_market"]},
 {id:"inventory_health",label:"Inventory health",source:DERIVED,children:["inventory_availability","inventory_variance","purchase_price","waste_loss"]},
 {id:"inventory_availability",label:"Stock availability / stockout risk",source:INTERNAL,external:["supplier_market_prices","supplier_disruption"]},
 {id:"customer_retention",label:"Customer retention / churn",source:DERIVED,children:["repeat_customer_rate","service_quality","price"],external:["competitor_pressure","reviews_reputation","market_pricing"]},
 {id:"repeat_customer_rate",label:"Repeat customer rate",source:INTERNAL},
 {id:"customer_acquisition",label:"Customer acquisition",source:DERIVED,children:["lead_volume","conversion_rate","marketing_cost"]},
 {id:"service_quality",label:"Service quality",source:DERIVED,children:["service_failures","response_time","staff_coverage","inventory_availability"],external:["reviews_reputation"]},
 {id:"service_failures",label:"Service failures / complaints",source:INTERNAL},
 {id:"response_time",label:"Service / response time",source:INTERNAL},
 {id:"project_delivery",label:"Project delivery performance",source:DERIVED,children:["project_delay","task_blockers","resource_capacity","supplier_delay"]},
 {id:"project_delay",label:"Project schedule delay",source:INTERNAL,external:["weather","supplier_disruption","labor_market"]},
 {id:"task_blockers",label:"Task dependency blockers",source:INTERNAL},
 {id:"resource_capacity",label:"Resource capacity",source:INTERNAL,children:["staff_coverage","hours"]},
 {id:"supplier_delay",label:"Supplier / procurement delay",source:INTERNAL,external:["supplier_disruption"]},
 {id:"revenue",label:"Revenue",source:INTERNAL,children:["volume","price","mix","discounts_refunds"]},
 {id:"volume",label:"Sales / booking volume",source:INTERNAL,external:["weather","seasonality","tourism_demand","local_events","competitor_pressure","reviews_reputation"]},
 {id:"price",label:"Realized selling price",source:INTERNAL,external:["competitor_pressure","market_pricing"]},
 {id:"mix",label:"Product / channel / customer mix",source:INTERNAL,external:["tourism_demand","local_events","competitor_pressure"]},
 {id:"discounts_refunds",label:"Discounts, comps, refunds and leakage",source:INTERNAL},
 {id:"cost_total",label:"Total cost",source:INTERNAL,children:["cogs","labor","occupancy_cost","utilities","marketing_cost","fees_finance","waste_loss"]},
 {id:"cogs",label:"Cost of goods sold",source:INTERNAL,children:["purchase_price","recipe_usage","inventory_variance"],external:["supplier_market_prices","fx","inflation"]},
 {id:"purchase_price",label:"Supplier purchase price",source:INTERNAL,external:["supplier_market_prices","fx","inflation"]},
 {id:"recipe_usage",label:"Recipe / consumption quantity",source:INTERNAL},
 {id:"inventory_variance",label:"Inventory variance / shrinkage",source:INTERNAL},
 {id:"labor",label:"Labor cost",source:INTERNAL,children:["hours","wage_rate","overtime_productivity"]},
 {id:"hours",label:"Paid hours",source:INTERNAL}, {id:"wage_rate",label:"Wage rate",source:INTERNAL,external:["labor_market"]},
 {id:"overtime_productivity",label:"Overtime and productivity",source:INTERNAL},
 {id:"occupancy_cost",label:"Rent / property occupancy cost",source:INTERNAL},
 {id:"utilities",label:"Utilities",source:INTERNAL,children:["electricity","water","gas_fuel"],external:["weather","utility_tariffs"]},
 {id:"electricity",label:"Electricity usage and cost",source:INTERNAL,external:["weather","utility_tariffs"]},
 {id:"water",label:"Water usage and cost",source:INTERNAL,external:["weather","utility_tariffs"]},
 {id:"gas_fuel",label:"Gas / fuel usage and cost",source:INTERNAL,external:["energy_prices"]},
 {id:"marketing_cost",label:"Marketing spend",source:INTERNAL,external:["ad_market_prices"]},
 {id:"fees_finance",label:"Payment, bank, platform and finance fees",source:INTERNAL,external:["fx","interest_rates"]},
 {id:"waste_loss",label:"Waste, breakage, theft and operational loss",source:INTERNAL},
 {id:"weather",label:"Weather",source:EXTERNAL}, {id:"seasonality",label:"Seasonality / calendar",source:EXTERNAL},
 {id:"tourism_demand",label:"Tourism / destination demand",source:EXTERNAL}, {id:"local_events",label:"Local events",source:EXTERNAL},
 {id:"competitor_pressure",label:"Competitor activity",source:EXTERNAL}, {id:"reviews_reputation",label:"Reviews / reputation",source:EXTERNAL},
 {id:"market_pricing",label:"Market pricing",source:EXTERNAL}, {id:"supplier_market_prices",label:"Supplier / commodity market prices",source:EXTERNAL},
 {id:"fx",label:"FX rates",source:EXTERNAL}, {id:"inflation",label:"Inflation",source:EXTERNAL}, {id:"labor_market",label:"Labor market",source:EXTERNAL},
 {id:"utility_tariffs",label:"Utility tariffs",source:EXTERNAL}, {id:"energy_prices",label:"Energy prices",source:EXTERNAL},
 {id:"ad_market_prices",label:"Advertising market prices",source:EXTERNAL}, {id:"interest_rates",label:"Interest rates",source:EXTERNAL},
 {id:"customer_payment_behavior",label:"Customer payment behavior",source:EXTERNAL}, {id:"supplier_terms",label:"Supplier credit / payment terms",source:EXTERNAL},
 {id:"supplier_disruption",label:"Supplier disruption / lead-time pressure",source:EXTERNAL},
]);
const byId=new Map(nodes.map(n=>[n.id,n]));
const INDUSTRY_OVERLAYS=Object.freeze({
 restaurant:{priority:["volume","mix","price","cogs","recipe_usage","inventory_variance","labor","utilities","waste_loss"],external:["weather","tourism_demand","seasonality","local_events","reviews_reputation","competitor_pressure","supplier_market_prices"]},
 hotel:{priority:["volume","price","mix","labor","utilities","occupancy_cost","marketing_cost"],external:["tourism_demand","seasonality","weather","local_events","reviews_reputation","competitor_pressure","market_pricing","fx"]},
 retail:{priority:["volume","price","mix","cogs","inventory_variance","marketing_cost","labor"],external:["seasonality","competitor_pressure","market_pricing","supplier_market_prices","fx","inflation"]},
 construction:{priority:["revenue","cogs","purchase_price","labor","hours","overtime_productivity","fees_finance"],external:["supplier_market_prices","fx","inflation","labor_market","interest_rates","energy_prices","weather"]},
 accounting:{priority:["revenue","volume","price","labor","hours","overtime_productivity"],external:["seasonality","labor_market","inflation","competitor_pressure","market_pricing"]},
 healthcare:{priority:["volume","price","mix","labor","utilities","fees_finance"],external:["seasonality","labor_market","inflation","utility_tariffs"]},
 pest_control:{priority:["volume","price","labor","hours","marketing_cost","gas_fuel","cogs"],external:["weather","seasonality","fuel_prices","labor_market","competitor_pressure","market_pricing"]},
 entertainment:{priority:["volume","price","mix","labor","marketing_cost","utilities"],external:["weather","seasonality","tourism_demand","local_events","reviews_reputation","competitor_pressure"]},
 manufacturing:{priority:["volume","price","cogs","purchase_price","inventory_variance","labor","utilities","waste_loss"],external:["supplier_market_prices","fx","inflation","energy_prices","labor_market"]},
 "artist-agency":{priority:["volume","price","mix","labor","marketing_cost","fees_finance"],external:["seasonality","local_events","competitor_pressure","market_pricing","fx"]},
});
const INDUSTRY_ALIASES=Object.freeze({bar:"restaurant",pub:"restaurant",cafe:"restaurant",resort:"hotel",shop:"retail",store:"retail",contractor:"construction",agency:"artist-agency",booking_agency:"artist-agency",pest_control:"pest_control","pest-control":"pest_control",venue:"entertainment",nightclub:"entertainment",factory:"manufacturing"});
function normalizeIndustry(value){const raw=String(value??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");return INDUSTRY_ALIASES[raw]||raw||"general"}
export function businessDriverIndustryOverlay({industry="general",solution_ids=[]}={}){const candidates=[...solution_ids,industry].map(normalizeIndustry).filter(Boolean);for(const key of candidates){const overlay=INDUSTRY_OVERLAYS[key];if(overlay)return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,industry:key,priority_driver_ids:[...overlay.priority],external_context_ids:unique([...(overlay.external||[])]),industry_specific:true,core_driver_graph_unchanged:true,authority_effect:"NONE"};}return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,industry:normalizeIndustry(industry),priority_driver_ids:[],external_context_ids:[],industry_specific:false,core_driver_graph_unchanged:true,authority_effect:"NONE"}}

function unique(v){return [...new Set((Array.isArray(v)?v:[]).filter(Boolean))]}
function walk(id,seen=new Set()){if(seen.has(id))return[];seen.add(id);const n=byId.get(id);if(!n)return[];return [n,...(n.children||[]).flatMap(c=>walk(c,seen))]}
export function businessDriverDiagnosisPlan({metric="profit",industry="general",solution_ids=[]}={}){const root=byId.has(metric)?metric:"profit";const internal=walk(root).filter(n=>n.source!==EXTERNAL);const overlay=businessDriverIndustryOverlay({industry,solution_ids});const prioritized=overlay.priority_driver_ids.filter(id=>internal.some(n=>n.id===id));const remaining=internal.map(n=>n.id).filter(id=>!prioritized.includes(id));const external=unique([...overlay.external_context_ids,...internal.flatMap(n=>n.external||[])]).map(id=>byId.get(id)||{id,label:id,source:EXTERNAL}).filter(Boolean);return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,metric:root,industry:overlay.industry,industry_specific:overlay.industry_specific,internal_driver_ids:[...prioritized,...remaining],priority_driver_ids:prioritized,external_context_ids:external.map(n=>n.id),diagnostic_order:["VERIFY_METRIC_CHANGE","DECOMPOSE_INTERNAL_DRIVERS","IDENTIFY_LARGEST_EXPLAINED_VARIANCES","FORM_EXTERNAL_HYPOTHESES_FOR_UNEXPLAINED_VARIANCE","GATHER_CURRENT_EXTERNAL_EVIDENCE","TEST_TIMING_AND_DIRECTION_CONSISTENCY","REPORT_SUPPORTED_DRIVERS_AND_UNRESOLVED_ALTERNATIVES"],causal_policy:{correlation_is_not_cause:true,external_context_is_hypothesis_until_supported:true,internal_variance_should_be_quantified_before_external_storytelling:true,confounders_must_be_considered:true,causal_claim_requires_stronger_evidence_than_timing_correlation:true},authority_effect:"NONE"};}
export function businessDriverGraph(){return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,node_count:nodes.length,nodes:nodes.map(n=>({...n})),authority_effect:"NONE"}}
export const AvantiqoBusinessDriverGraphRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,graph:businessDriverGraph,diagnose:businessDriverDiagnosisPlan,industryOverlay:businessDriverIndustryOverlay});
