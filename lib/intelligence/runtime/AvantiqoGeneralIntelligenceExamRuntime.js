import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveNightlyLearningLocalIdleState } from "@/lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime";

export const AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT = "AVANTIQO_GENERAL_INTELLIGENCE_EXAM_V1";
const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses";
const EXAM_SCOPE = "platform_general_intelligence_exams";
const PROVIDER = "avantiqo-intelligence";
const MODEL = "qwen3:4b-instruct";
const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1";
const MAX_POLLS = 160;
const POLL_MS = 500;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sha(v){return createHash("sha256").update(String(v??"")).digest("hex")}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function normalizeLabel(v){const x=text(v,40).toUpperCase(); return ["SUPPORTED","CONTRADICTED","INSUFFICIENT"].includes(x)?x:"INVALID"}
function uniqueClaims(rows){const out=[]; const seen=new Set(); for(const row of rows){const claim=text(row.content,1800); if(!claim) continue; const k=claim.toLowerCase(); if(seen.has(k)) continue; seen.add(k); out.push({claim,confidence:Number(row.confidence||0),topic_key:text(object(row.metadata).topic_key,240)});} return out;}
function buildCases(claims){
  const selected=claims.slice(0,6); if(selected.length<3) return [];
  const cases=[];
  for(let i=0;i<Math.min(3,selected.length);i++){
    const target=selected[i], other=selected[(i+1)%selected.length];
    cases.push({id:`support-${i+1}`,label:"SUPPORTED",statement:target.claim,evidence:[{id:"E1",claim:target.claim},{id:"E2",claim:other.claim}],required_evidence_ids:["E1"]});
  }
  for(let i=0;i<Math.min(2,selected.length);i++){
    const target=selected[i];
    cases.push({id:`contradicted-${i+1}`,label:"CONTRADICTED",statement:`The supplied evidence does not contain or support this claim: ${target.claim}`,evidence:[{id:"E1",claim:target.claim}],required_evidence_ids:["E1"]});
  }
  for(let i=0;i<Math.min(2,selected.length);i++){
    const target=selected[i];
    cases.push({id:`insufficient-${i+1}`,label:"INSUFFICIENT",statement:`This limited evidence proves the claim is universally true in every context without exception: ${target.claim}`,evidence:[{id:"E1",claim:target.claim}],required_evidence_ids:[]});
  }
  return cases;
}
function examPrompt(topic,cases){return [
  "You are taking an evidence-discipline exam.",
  "Use only the evidence supplied inside each case.",
  "For each case classify the statement as SUPPORTED, CONTRADICTED, or INSUFFICIENT.",
  "Do not use outside knowledge and do not guess.",
  "Return JSON only with answers: [{id,label,evidence_ids,explanation}].",
  `Topic: ${topic}`,
  JSON.stringify({cases}),
].join("\n")}
function parseJson(v){return JSON.parse(text(v,60000).replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}
function grade(cases,answers){
  const byId=new Map(list(answers).map(a=>[text(a?.id,80),object(a)])); let points=0; let max=0; const details=[];
  for(const c of cases){const a=byId.get(c.id)||{}; const label=normalizeLabel(a.label); const ids=new Set(list(a.evidence_ids).map(x=>text(x,40))); const labelOk=label===c.label; const evidenceOk=c.required_evidence_ids.length===0?ids.size===0:c.required_evidence_ids.every(id=>ids.has(id)); const abstentionOk=c.label!=="INSUFFICIENT"||ids.size===0; const earned=(labelOk?2:0)+(evidenceOk?1:0)+(abstentionOk?1:0); points+=earned; max+=4; details.push({id:c.id,expected:c.label,actual:label,label_ok:labelOk,evidence_ok:evidenceOk,abstention_ok:abstentionOk,points:earned,max_points:4});}
  const score=max?points/max:0; const weakness=1-score; return {score:Number(score.toFixed(4)),weakness_score:Number(weakness.toFixed(4)),passed:score>=0.8,points,max_points:max,details};
}
export async function runAvantiqoGeneralIntelligenceExam({organizationId=text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID),topicKey=null}={}){
  if(!organizationId) return {success:true,status:"DEFERRED",reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT};
  const synthesisQ=await supabaseAdmin.from(MEMORY_TABLE).select("id,subject,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",SYNTHESIS_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(20); if(synthesisQ.error) throw synthesisQ.error;
  const synthesis=list(synthesisQ.data).find(r=>{const m=object(r.metadata); const key=text(m.root_topic_key||r.subject,240); return key.startsWith("world-")&&(!topicKey||key===topicKey)&&m.local_4b===true;});
  if(!synthesis) return {success:true,status:"IDLE",reason:"NO_WORLD_SYNTHESIS_READY",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT};
  const topic=text(object(synthesis.metadata).root_topic_key||synthesis.subject,240);
  const existing=await supabaseAdmin.from(MEMORY_TABLE).select("id").eq("organization_id",organizationId).eq("memory_scope",EXAM_SCOPE).eq("memory_key",`exam:${sha(`${topic}|${text(object(synthesis.metadata).synthesis_fingerprint,128)}`).slice(0,40)}`).maybeSingle(); if(existing.error) throw existing.error; if(existing.data?.id) return {success:true,status:"IDLE",reason:"EXAM_ALREADY_COMPLETED",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic};
  const knowledgeQ=await supabaseAdmin.from(MEMORY_TABLE).select("content,confidence,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",KNOWLEDGE_SCOPE).eq("active",true).eq("metadata->>topic_key",topic).order("confidence",{ascending:false}).limit(20); if(knowledgeQ.error) throw knowledgeQ.error;
  const claims=uniqueClaims(list(knowledgeQ.data).filter(r=>Number(r.confidence||0)>=0.72&&object(r.metadata).customer_private_memory!==true)); const cases=buildCases(claims); if(cases.length<4) return {success:true,status:"DEFERRED",reason:"INSUFFICIENT_VERIFIED_CLAIMS_FOR_EXAM",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic,claim_count:claims.length};
  const idle=await resolveNightlyLearningLocalIdleState(); if(!idle.ready) return {success:true,status:"DEFERRED",reason:idle.online_node_count?"LOCAL_GPU_BUSY":"LOCAL_NODE_OFFLINE",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic,idle};
  const input={capability:"ai.text.generate",execution_lane:"fast",messages:[{role:"system",content:"Answer the exam exactly as JSON. Never reveal chain-of-thought."},{role:"user",content:examPrompt(topic,cases)}],temperature:0,max_output_tokens:1400,response_format:{type:"json_object"}};
  let ex=await executeService({organization_id:organizationId,bill_to_organization_id:organizationId,service_id:"ai.text.generate",provider_id:PROVIDER,capability:"ai.text.generate",input,metadata:{general_intelligence_exam:true,local_first:true,external_fallback_allowed:false},category:"GENERAL_INTELLIGENCE_EXAM",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}}); let settled=ex;
  for(let i=0;ex?.pending===true&&i<MAX_POLLS;i++){settled=await settlePendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:ex.provider_job_id,usage_id:ex.usage?.id,pricing:object(ex.pricing),quantity:ex.usage?.quantity??1,unit:ex.usage?.unit||ex.pricing?.unit||"request",metadata:{general_intelligence_exam:true,local_first:true},provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"},credential_id:ex.credential_id||null,started_at:ex.started_at||null}); if(settled?.pending!==true) break; await sleep(POLL_MS);}
  if(settled?.pending===true) return {success:true,status:"DEFERRED",reason:"LOCAL_JOB_STILL_RUNNING",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic}; if(settled?.success!==true) throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT}_EXECUTION_FAILED:${text(settled?.error,500)}`);
  const out=object(settled.output),nested=object(out.output),infra=text(nested.infrastructure_provider||out.infrastructure_provider,200); if(infra!==LOCAL_INFRA) throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT}_LOCAL_4B_REQUIRED:${infra||"NONE"}`); const parsed=parseJson(nested.text||out.text); const grading=grade(cases,parsed.answers); const fp=text(object(synthesis.metadata).synthesis_fingerprint,128); const now=new Date().toISOString(); const key=`exam:${sha(`${topic}|${fp}`).slice(0,40)}`;
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:EXAM_SCOPE,memory_key:key,memory_type:"assessment",subject:topic,content:`General intelligence exam ${grading.passed?"passed":"needs practice"}: ${(grading.score*100).toFixed(1)}%.`,importance:0.75,confidence:1,source:"general_intelligence_exam",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic,model:MODEL,infrastructure_provider:infra,local_4b:true,score:grading.score,weakness_score:grading.weakness_score,passed:grading.passed,grading,case_count:cases.length,synthesis_fingerprint:fp,exam_cases:cases,automatic_model_training:false,automatic_model_promotion:false,automatic_knowledge_promotion:false,customer_private_content_included:false,raw_reasoning_persisted:false,created_at:now},updated_at:now}; const wr=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"}); if(wr.error) throw wr.error;
  return {success:true,status:"COMPLETED",contract:AVANTIQO_GENERAL_INTELLIGENCE_EXAM_CONTRACT,topic_key:topic,score:grading.score,weakness_score:grading.weakness_score,passed:grading.passed,case_count:cases.length,local_4b:true,model:MODEL,infrastructure_provider:infra};
}
