import { createHash } from "node:crypto";
import { runOperatorPublicSearchDiscovery } from "../../platform/research/runtime/OperatorPublicSearchDiscoveryRuntime.js";

export const AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT = "AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_V1";
const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=4000)=>String(v??"").trim().slice(0,n);
const hash=(v)=>createHash("sha256").update(String(v??"")).digest("hex");
function host(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return null;}}
function sourceRecord(source={}){
  const url=text(source.url,2000); const publisher=text(source.publisher,300)||host(url);
  return {url,title:text(source.title,500)||null,publisher:publisher||null,independence_group:host(url)||publisher||null,published_at:text(source.published_at,120)||null,retrieved_at:text(source.retrieved_at,120)||null,excerpt:text(source.excerpt,2600)||null,official:source.official===true,primary:source.primary===true,source_fingerprint:hash(`${url}|${text(source.excerpt,2600)}`),authority_effect:"NONE"};
}
export async function collectBusinessExternalEvidence({research_plan=null,organization_id=null,discover=runOperatorPublicSearchDiscovery,max_requests=6}={}){
  if(research_plan?.research_allowed!==true) return {contract:AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT,status:"COLLECTION_BLOCKED_INTERNAL_GATE",packets:[],failed_context_ids:[],authority_effect:"NONE"};
  const requests=list(research_plan.requests).slice(0,Math.max(1,Math.min(12,Number(max_requests)||6)));
  const packets=[]; const failed=[];
  for(const request of requests){
    try{
      const found=await discover({context:{organization_id},payload:{query:request.query,queries:[request.query]}});
      const sources=list(found?.sources).map(sourceRecord).filter(s=>s.url&&s.excerpt&&s.independence_group);
      const groups=[...new Set(sources.map(s=>s.independence_group))];
      packets.push({context_id:request.context_id,request,status:sources.length?"SOURCES_COLLECTED":"NO_USABLE_SOURCES",sources,source_count:sources.length,independent_source_group_count:groups.length,official_primary_source_present:sources.some(s=>s.official&&s.primary),search_transport:found?.evidence?.search_transport||null,external_intelligence_provider_used:found?.evidence?.external_intelligence_provider_used===true,period_match_state:"REQUIRES_ASSESSMENT",freshness_state:"REQUIRES_ASSESSMENT",causal_assessment_state:"REQUIRES_OWNED_REASONING",authority_effect:"NONE"});
      if(!sources.length) failed.push(request.context_id);
    }catch(error){
      packets.push({context_id:request.context_id,request,status:"COLLECTION_FAILED",sources:[],error_code:text(error?.code||error?.name||"ERROR",100),authority_effect:"NONE"});
      failed.push(request.context_id);
    }
  }
  return {contract:AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT,status:failed.length?(packets.some(p=>p.sources?.length)?"COMPLETED_WITH_GAPS":"COLLECTION_FAILED"):"COMPLETED",packets,failed_context_ids:[...new Set(failed)],policy:{public_search_discovery_only:true,external_intelligence_provider_forbidden:true,source_content_untrusted:true,collection_does_not_establish_causality:true,period_and_freshness_require_separate_assessment:true,no_automatic_monetary_attribution:true,authority_effect:"NONE"},authority_effect:"NONE"};
}
export const AvantiqoBusinessExternalEvidenceCollectorRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT,collect:collectBusinessExternalEvidence});
