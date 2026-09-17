import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveNightlyLearningLocalIdleState } from "@/lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime";

export const AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT = "AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_V1";
const MEMORY_TABLE = "intelligence_memories";
const RETENTION_SCOPE = "platform_general_intelligence_retention";
const SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const AGENDA_SCOPE = "platform_learning_agenda";
const TRANSFER_SCOPE = "platform_general_intelligence_transfer_practice";
const PROVIDER = "avantiqo-intelligence";
const MODEL = "qwen3:4b-instruct";
const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1";
const MAX_POLLS = 140;
const POLL_MS = 500;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sha(v){return createHash("sha256").update(String(v??"")).digest("hex")}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function parseJson(v){return JSON.parse(text(v,60000).replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}
function domainOf(row){return text(object(row?.metadata).knowledge_domain,120).toLowerCase()}
function topicOf(row){return text(object(row?.metadata).topic_key||row?.subject,240)}
function evidencePacket(rows,prefix){return list(rows).slice(0,5).map((row,index)=>({id:`${prefix}${index+1}`,claim:text(row.content,1600),confidence:Number(row.confidence||0)}))}
function gradeTransfer(output,sourceIds,targetIds){
  const o=object(output); const used=new Set(list(o.evidence_ids).map(x=>text(x,40)));
  const sourceUsed=[...sourceIds].some(id=>used.has(id)); const targetUsed=[...targetIds].some(id=>used.has(id));
  const invariants=list(o.invariants).map(x=>text(x,800)).filter(Boolean);
  const boundaries=list(o.boundary_conditions).map(x=>text(x,800)).filter(Boolean);
  const falsifiers=list(o.falsifiers).map(x=>text(x,800)).filter(Boolean);
  const verdict=text(o.verdict,40).toUpperCase();
  let points=0; const max=10;
  if(sourceUsed) points+=2; if(targetUsed) points+=2;
  if(invariants.length>=1) points+=2; if(boundaries.length>=2) points+=2; if(falsifiers.length>=1) points+=1;
  if(["TRANSFER_HYPOTHESIS","UNSUPPORTED_TRANSFER"].includes(verdict)) points+=1;
  const score=points/max;
  return {score:Number(score.toFixed(4)),passed:score>=0.8,source_evidence_used:sourceUsed,target_evidence_used:targetUsed,invariant_count:invariants.length,boundary_count:boundaries.length,falsifier_count:falsifiers.length,verdict,points,max_points:max};
}
async function callLocal({organizationId,prompt}){
  const idle=await resolveNightlyLearningLocalIdleState();
  if(!idle.ready)return {deferred:true,reason:idle.online_node_count?"LOCAL_GPU_BUSY":"LOCAL_NODE_OFFLINE"};
  const input={capability:"ai.text.generate",execution_lane:"fast",messages:[{role:"system",content:"Return JSON only. Never reveal chain-of-thought. Treat analogy as hypothesis, not evidence."},{role:"user",content:prompt}],temperature:0.1,max_output_tokens:1400,response_format:{type:"json_object"}};
  let ex=await executeService({organization_id:organizationId,bill_to_organization_id:organizationId,service_id:"ai.text.generate",provider_id:PROVIDER,capability:"ai.text.generate",input,metadata:{general_intelligence_transfer_practice:true,local_first:true,external_fallback_allowed:false},category:"GENERAL_INTELLIGENCE_TRANSFER_PRACTICE",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}}); let settled=ex;
  for(let i=0;ex?.pending===true&&i<MAX_POLLS;i++){settled=await settlePendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:ex.provider_job_id,usage_id:ex.usage?.id,pricing:object(ex.pricing),quantity:ex.usage?.quantity??1,unit:ex.usage?.unit||ex.pricing?.unit||"request",metadata:{general_intelligence_transfer_practice:true,local_first:true},provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"},credential_id:ex.credential_id||null,started_at:ex.started_at||null});if(settled?.pending!==true)break;await sleep(POLL_MS);}
  if(settled?.pending===true)return {deferred:true,reason:"LOCAL_JOB_STILL_RUNNING"};
  if(settled?.success!==true)throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT}_EXECUTION_FAILED:${text(settled?.error,500)}`);
  const out=object(settled.output),nested=object(out.output),infra=text(nested.infrastructure_provider||out.infrastructure_provider,200);
  if(infra!==LOCAL_INFRA)throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT}_LOCAL_4B_REQUIRED:${infra||"NONE"}`);
  return {deferred:false,parsed:parseJson(nested.text||out.text),infra};
}

export async function runAvantiqoGeneralIntelligenceTransferPractice({organizationId=text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID)}={}){
  if(!organizationId)return {success:true,status:"DEFERRED",reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT};
  const retention=await supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",RETENTION_SCOPE).eq("active",true).eq("metadata->>mastery_candidate","true").order("updated_at",{ascending:false}).limit(50); if(retention.error)throw retention.error;
  const source=list(retention.data)[0]; if(!source)return {success:true,status:"IDLE",reason:"NO_MASTERY_CANDIDATE_SOURCE",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT};
  const sourceTopic=source.subject;
  const sourceSynthesisQ=await supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",SYNTHESIS_SCOPE).eq("active",true).eq("metadata->>root_topic_key",sourceTopic).order("updated_at",{ascending:false}).limit(1); if(sourceSynthesisQ.error)throw sourceSynthesisQ.error;
  const sourceSynthesis=list(sourceSynthesisQ.data)[0]; if(!sourceSynthesis)return {success:true,status:"DEFERRED",reason:"SOURCE_SYNTHESIS_REQUIRED",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic};
  const agendas=await supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,importance,updated_at").eq("organization_id",organizationId).eq("memory_scope",AGENDA_SCOPE).eq("source","general_intelligence_curriculum").eq("active",true).order("importance",{ascending:false}).limit(50); if(agendas.error)throw agendas.error;
  const sourceDomain=domainOf(list(agendas.data).find(r=>topicOf(r)===sourceTopic));
  const target=list(agendas.data).find(r=>topicOf(r)!==sourceTopic&&domainOf(r)&&domainOf(r)!==sourceDomain);
  if(!target)return {success:true,status:"IDLE",reason:"NO_CROSS_DOMAIN_TARGET",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic};
  const targetTopic=topicOf(target),targetDomain=domainOf(target);
  const prior=await supabaseAdmin.from(MEMORY_TABLE).select("id").eq("organization_id",organizationId).eq("memory_scope",TRANSFER_SCOPE).eq("memory_key",`transfer-practice:${sha(`${sourceTopic}|${targetTopic}`).slice(0,40)}`).maybeSingle(); if(prior.error)throw prior.error; if(prior.data?.id)return {success:true,status:"IDLE",reason:"TRANSFER_PAIR_ALREADY_PRACTICED",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic,target_topic_key:targetTopic};
  const knowledge=await supabaseAdmin.from(MEMORY_TABLE).select("content,confidence,metadata").eq("organization_id",organizationId).eq("memory_scope",KNOWLEDGE_SCOPE).eq("active",true).order("confidence",{ascending:false}).limit(500); if(knowledge.error)throw knowledge.error;
  const sourceEvidence=evidencePacket(list(knowledge.data).filter(r=>topicOf(r)===sourceTopic&&Number(r.confidence||0)>=0.72&&object(r.metadata).customer_private_memory!==true),"S");
  const targetEvidence=evidencePacket(list(knowledge.data).filter(r=>topicOf(r)===targetTopic&&Number(r.confidence||0)>=0.72&&object(r.metadata).customer_private_memory!==true),"T");
  if(sourceEvidence.length<2||targetEvidence.length<2)return {success:true,status:"DEFERRED",reason:"CROSS_DOMAIN_VERIFIED_EVIDENCE_REQUIRED",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic,target_topic_key:targetTopic};
  const synthesis=object(object(sourceSynthesis.metadata).synthesis); const sourceMechanisms=list(synthesis.mechanisms).slice(0,4);
  const prompt=["Cross-domain transfer practice.","Do not copy surface patterns. Treat analogy as a hypothesis only.","Use both SOURCE and TARGET evidence.","Choose at most one source mechanism to test against the target domain.","Return JSON with: source_mechanism, target_application, invariants[], boundary_conditions[], falsifiers[], evidence_ids[], verdict, explanation.","verdict must be TRANSFER_HYPOTHESIS or UNSUPPORTED_TRANSFER.",JSON.stringify({source_topic:sourceTopic,source_domain:sourceDomain,source_mechanisms:sourceMechanisms,source_evidence:sourceEvidence,target_topic:targetTopic,target_domain:targetDomain,target_evidence:targetEvidence})].join("\n");
  const call=await callLocal({organizationId,prompt}); if(call.deferred)return {success:true,status:"DEFERRED",reason:call.reason,contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic,target_topic_key:targetTopic};
  const grading=gradeTransfer(call.parsed,new Set(sourceEvidence.map(x=>x.id)),new Set(targetEvidence.map(x=>x.id))); const now=new Date().toISOString();
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:TRANSFER_SCOPE,memory_key:`transfer-practice:${sha(`${sourceTopic}|${targetTopic}`).slice(0,40)}`,memory_type:"assessment",subject:`${sourceTopic}->${targetTopic}`,content:`Cross-domain transfer practice ${grading.passed?"passed":"needs practice"}: ${(grading.score*100).toFixed(1)}%.`,importance:grading.passed?0.78:0.92,confidence:1,source:"general_intelligence_transfer_practice",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic,source_domain:sourceDomain,target_topic_key:targetTopic,target_domain:targetDomain,score:grading.score,passed:grading.passed,grading,transfer_output:call.parsed,analogy_is_hypothesis_not_evidence:true,automatic_transfer_inference:false,automatic_mastery_promotion:false,automatic_knowledge_promotion:false,automatic_model_training:false,automatic_model_promotion:false,local_4b:true,model:MODEL,infrastructure_provider:call.infra,customer_private_content_included:false,raw_reasoning_persisted:false,created_at:now},updated_at:now}; const wr=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"});if(wr.error)throw wr.error;
  return {success:true,status:"COMPLETED",contract:AVANTIQO_GENERAL_INTELLIGENCE_TRANSFER_PRACTICE_CONTRACT,source_topic_key:sourceTopic,target_topic_key:targetTopic,score:grading.score,passed:grading.passed,verdict:grading.verdict,local_4b:true};
}
