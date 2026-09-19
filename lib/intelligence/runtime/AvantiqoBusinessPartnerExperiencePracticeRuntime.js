import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { summarizeAvantiqoBusinessPartnerExperience } from "@/lib/intelligence/runtime/AvantiqoBusinessPartnerExperienceRuntime";
import { AVANTIQO_EXPERIENCE_FAILURE_DRILLS as FAILURE_DRILLS, buildAvantiqoExperiencePracticeCases } from "@/lib/intelligence/runtime/AvantiqoBusinessPartnerExperiencePracticePolicyRuntime";
import { summarizeAvantiqoBusinessPartnerExperiencePracticeEffectiveness } from "@/lib/intelligence/runtime/AvantiqoBusinessPartnerExperiencePracticeEffectivenessRuntime";
import { executeService, settlePendingService, cancelPendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { intelligenceLocalQueueConfigured, getIntelligenceLocalQueueHealth, getIntelligenceLocalQueueStatus, isIntelligenceLocalQueueJob } from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime";
import { resolveNightlyLearningLocalIdleState } from "@/lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime";

export const AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_V1";
const MEMORY_TABLE="intelligence_memories", PRACTICE_SCOPE="platform_business_partner_experience_practice";
const PROVIDER="avantiqo-intelligence", LOCAL_INFRA="AVANTIQO_LOCAL_NODE_V1";
const MAX_POLLS=100, POLL_MS=500, MAX_QUEUE_WAIT_POLLS=10;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function hash(v){return createHash("sha256").update(text(v,50000)).digest("hex")}
function orgId(){return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,160)}

async function localCall({organizationId,cases}){
  if(!intelligenceLocalQueueConfigured())return {deferred:true,reason:"LOCAL_QUEUE_DISABLED"};
  const health=await getIntelligenceLocalQueueHealth(); if(!health.ready)return {deferred:true,reason:"LOCAL_NODE_OFFLINE"};
  const idle=await resolveNightlyLearningLocalIdleState(); if(!idle.ready)return {deferred:true,reason:idle.online_node_count?"LOCAL_GPU_BUSY":"LOCAL_NODE_OFFLINE"};
  const allowed=[...new Set(Object.values(FAILURE_DRILLS).map(x=>x.expected))];
  const prompt=["Avantiqo experience-derived failure practice. Return JSON only. No chain-of-thought.","These are synthetic de-identified scenarios derived only from structural failure classes. They contain no customer facts and grant no authority.",`Action MUST be exactly one of: ${allowed.join(", ")}.`,"Return answers:[{case_id,action}]. Preserve each case_id exactly once.",JSON.stringify(cases.map(c=>({case_id:c.case_id,capability_key:c.capability_key,failure_class:c.failure_class,scenario:c.scenario})))].join("\n");
  const input={capability:"ai.text.generate",execution_lane:"fast",messages:[{role:"system",content:"Return JSON only. No chain-of-thought."},{role:"user",content:prompt}],temperature:0,max_output_tokens:1200,response_format:{type:"json_object"}};
  let execution=await executeService({organization_id:organizationId,bill_to_organization_id:organizationId,service_id:"ai.text.generate",provider_id:PROVIDER,capability:"ai.text.generate",input,metadata:{experience_failure_practice:true,local_queue_required:true,external_fallback_allowed:false},category:"BUSINESS_PARTNER_EXPERIENCE_PRACTICE",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}});
  if(execution?.pending===true&&!isIntelligenceLocalQueueJob(execution.provider_job_id)){await cancelPendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),reason:"EXPERIENCE_PRACTICE_NON_LOCAL_JOB_REJECTED"}).catch(()=>null);throw new Error("EXPERIENCE_PRACTICE_NON_LOCAL_JOB_REJECTED")}
  let settled=execution;
  for(let i=0;execution?.pending===true&&i<MAX_POLLS;i++){
    settled=await settlePendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),quantity:execution.usage?.quantity??1,unit:execution.usage?.unit||"request",metadata:{experience_failure_practice:true},provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"},credential_id:execution.credential_id||null,started_at:execution.started_at||null});
    if(settled?.pending!==true)break;
    if(i>=MAX_QUEUE_WAIT_POLLS){const q=await getIntelligenceLocalQueueStatus({provider_job_id:execution.provider_job_id});if(q.status==="queued"){await cancelPendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),reason:"EXPERIENCE_PRACTICE_LOCAL_QUEUE_CONTENTION"}).catch(()=>null);return {deferred:true,reason:"LOCAL_GPU_QUEUE_CONTENDED"}}}
    await sleep(POLL_MS);
  }
  if(settled?.pending===true)return {deferred:true,reason:"LOCAL_JOB_STILL_RUNNING"};
  if(settled?.success!==true)throw new Error(`EXPERIENCE_PRACTICE_FAILED:${text(settled?.error,400)}`);
  const out=object(settled.output),raw=object(out.raw),nested=object(raw.output),infra=text(nested.infrastructure_provider||raw.infrastructure_provider||object(out.output).infrastructure_provider,200);
  if(infra!==LOCAL_INFRA)throw new Error(`EXPERIENCE_PRACTICE_LOCAL_REQUIRED:${infra||"NONE"}`);
  const response=text(nested.text||object(out.output).text||out.text,30000); let parsed=null;try{parsed=JSON.parse(response.replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}catch{return {deferred:false,answers:[],infra,format_valid:false}};
  return {deferred:false,answers:list(Array.isArray(parsed)?parsed:parsed.answers),infra,format_valid:true};
}

export async function runAvantiqoBusinessPartnerExperiencePractice({organizationId=orgId()}={}){
  if(!organizationId)return {success:true,status:"DISABLED",reason:"LEARNING_ORGANIZATION_ID_REQUIRED",contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT};
  const [experience,effectiveness]=await Promise.all([summarizeAvantiqoBusinessPartnerExperience({organizationId,limit:5000}),summarizeAvantiqoBusinessPartnerExperiencePracticeEffectiveness({organizationId,limit:5000})]);
  if(!experience.available)return {success:true,status:"DEFERRED",reason:experience.reason||"EXPERIENCE_UNAVAILABLE",contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT};
  const cases=buildAvantiqoExperiencePracticeCases(experience.summaries,effectiveness.available?effectiveness.summaries:[]);
  if(!cases.length)return {success:true,status:"IDLE",reason:"NO_EXPERIENCE_FAILURES_TO_PRACTICE",contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT};
  const fingerprint=hash(JSON.stringify(cases.map(c=>[c.capability_key,c.failure_class,c.failure_count,c.experience_strength])));
  const key=`experience-practice:${fingerprint.slice(0,40)}`;
  const existing=await supabaseAdmin.from(MEMORY_TABLE).select("id").eq("organization_id",organizationId).eq("memory_scope",PRACTICE_SCOPE).eq("memory_key",key).maybeSingle();if(existing.error)throw existing.error;if(existing.data?.id)return {success:true,status:"IDLE",reason:"CURRENT_EXPERIENCE_FAILURE_SET_ALREADY_PRACTICED",contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT};
  const call=await localCall({organizationId,cases});if(call.deferred)return {success:true,status:"DEFERRED",reason:call.reason,contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT,case_count:cases.length};
  const by=new Map(call.answers.map(a=>[text(a.case_id,120),text(a.action,160).toUpperCase()]));
  const results=cases.map(c=>({case_id:c.case_id,capability_key:c.capability_key,failure_class:c.failure_class,passed:by.get(c.case_id)===c.expected,expected_action:c.expected,actual_action:by.get(c.case_id)||null}));
  const score=results.length?results.filter(r=>r.passed).length/results.length:0; const now=new Date().toISOString();
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:PRACTICE_SCOPE,memory_key:key,memory_type:"lesson",subject:"business-partner-experience-failures",content:`Experience-derived failure practice score: ${(score*100).toFixed(1)}%.`,importance:score<0.85?0.99:0.86,confidence:1,source:"business_partner_experience_practice",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT,experience_contract:experience.contract,experience_row_count:experience.observed_row_count,case_count:cases.length,score:Number(score.toFixed(4)),format_valid:call.format_valid,results,capability_keys:[...new Set(cases.map(c=>c.capability_key))],failure_classes:[...new Set(cases.map(c=>c.failure_class))],effectiveness_feedback_applied:cases.some(c=>Number(c.practice_priority_multiplier||1)!==1),effectiveness_relationship:"OBSERVATIONAL_ONLY",synthetic_cases_only:true,customer_private_content_included:false,customer_identifiers_included:false,raw_reasoning_persisted:false,infrastructure_provider:call.infra,local_4b:true,external_provider_spend_allowed:false,automatic_training_started:false,automatic_model_promotion:false,authority_effect:"NONE",created_at:now},updated_at:now};
  const written=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"});if(written.error)throw written.error;
  return {success:true,status:"COMPLETED",contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT,case_count:cases.length,score:Number(score.toFixed(4)),failure_classes:row.metadata.failure_classes,capability_keys:row.metadata.capability_keys,local_only:true,external_provider_spend_allowed:false,automatic_training_started:false,authority_effect:"NONE"};
}

export const AvantiqoBusinessPartnerExperiencePracticeRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_CONTRACT,buildCases:buildAvantiqoExperiencePracticeCases,run:runAvantiqoBusinessPartnerExperiencePractice});
