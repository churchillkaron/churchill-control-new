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
