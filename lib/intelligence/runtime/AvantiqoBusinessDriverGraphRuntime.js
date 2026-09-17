export const AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT="AVANTIQO_BUSINESS_DRIVER_GRAPH_V1";
const INTERNAL="INTERNAL",EXTERNAL="EXTERNAL",DERIVED="DERIVED";
const nodes=Object.freeze([
 {id:"profit",label:"Profit",source:DERIVED,children:["revenue","cost_total"]},
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
]);
const byId=new Map(nodes.map(n=>[n.id,n]));
function unique(v){return [...new Set((Array.isArray(v)?v:[]).filter(Boolean))]}
function walk(id,seen=new Set()){if(seen.has(id))return[];seen.add(id);const n=byId.get(id);if(!n)return[];return [n,...(n.children||[]).flatMap(c=>walk(c,seen))]}
export function businessDriverDiagnosisPlan({metric="profit"}={}){const root=byId.has(metric)?metric:"profit";const internal=walk(root).filter(n=>n.source!==EXTERNAL);const external=unique(internal.flatMap(n=>n.external||[])).map(id=>byId.get(id)).filter(Boolean);return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,metric:root,internal_driver_ids:internal.map(n=>n.id),external_context_ids:external.map(n=>n.id),diagnostic_order:["VERIFY_METRIC_CHANGE","DECOMPOSE_INTERNAL_DRIVERS","IDENTIFY_LARGEST_EXPLAINED_VARIANCES","FORM_EXTERNAL_HYPOTHESES_FOR_UNEXPLAINED_VARIANCE","GATHER_CURRENT_EXTERNAL_EVIDENCE","TEST_TIMING_AND_DIRECTION_CONSISTENCY","REPORT_SUPPORTED_DRIVERS_AND_UNRESOLVED_ALTERNATIVES"],causal_policy:{correlation_is_not_cause:true,external_context_is_hypothesis_until_supported:true,internal_variance_should_be_quantified_before_external_storytelling:true,confounders_must_be_considered:true,causal_claim_requires_stronger_evidence_than_timing_correlation:true},authority_effect:"NONE"};}
export function businessDriverGraph(){return{contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,node_count:nodes.length,nodes:nodes.map(n=>({...n})),authority_effect:"NONE"}}
export const AvantiqoBusinessDriverGraphRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DRIVER_GRAPH_CONTRACT,graph:businessDriverGraph,diagnose:businessDriverDiagnosisPlan});
