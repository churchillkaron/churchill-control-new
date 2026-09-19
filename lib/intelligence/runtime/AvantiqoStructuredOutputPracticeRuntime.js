import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService, settlePendingService, cancelPendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { intelligenceLocalQueueConfigured, getIntelligenceLocalQueueHealth, getIntelligenceLocalQueueStatus, isIntelligenceLocalQueueJob } from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime";
import { resolveNightlyLearningLocalIdleState } from "@/lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime";

export const AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT = "AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_V1";
const MEMORY_TABLE = "intelligence_memories";
const ARENA_SCOPE = "platform_intelligence_arena";
const PRACTICE_SCOPE = "platform_intelligence_structured_output_practice";
const PROVIDER = "avantiqo-intelligence";
const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1";
const MAX_POLLS = 100, POLL_MS = 500, MAX_QUEUE_WAIT_POLLS = 10;
const CASE_COUNT = 24;
const ACTIONS = ["READ_CURRENT_STATE","ASK_REQUIRED_INPUT","VERIFY_EFFECT","KEEP_IN_PROGRESS","USE_FAST_AUTHORITATIVE_PATH","GET_DISCRIMINATING_EVIDENCE"];
const STATUSES = ["READY","BLOCKED","IN_PROGRESS"];

function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function hash(v){return createHash("sha256").update(text(v,50000)).digest("hex")}
function orgId(){return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,160)}

function buildCases(arenaAttempt){
  const offset=Math.max(0,(Number(arenaAttempt||1)-1)%ACTIONS.length);
  return Array.from({length:CASE_COUNT},(_,index)=>{
    const action=ACTIONS[(index+offset)%ACTIONS.length];
    const status=STATUSES[index%STATUSES.length];
    return {id:`fmt_${String(index+1).padStart(2,"0")}`,action,status,replay_write:false,escalate:false,authority_unchanged:true,scenario:`Synthetic structured-output endurance item ${index+1}. Return only the requested typed fields; do not add prose.`};
  });
}

function grade(cases,answers,formatValid){
  const byId=new Map(list(answers).map((item)=>[text(item?.id,40),object(item)]));
  const seen=new Set();
  const details=cases.map((expected)=>{
    const actual=byId.get(expected.id)||{};
    const unique=!seen.has(expected.id); seen.add(expected.id);
    const checks={
      id:text(actual.id,40)===expected.id,
      unique_id:unique,
      action:text(actual.action,120)===expected.action,
      status:text(actual.status,80)===expected.status,
      replay_write:actual.replay_write===false,
      escalate:actual.escalate===false,
      authority_unchanged:actual.authority_unchanged===true,
      boolean_types:typeof actual.replay_write==="boolean"&&typeof actual.escalate==="boolean"&&typeof actual.authority_unchanged==="boolean",
    };
    return {id:expected.id,passed:Object.values(checks).every(Boolean),checks};
  });
  const exactCount=list(answers).length===cases.length;
  const allUnique=new Set(list(answers).map((item)=>text(item?.id,40)).filter(Boolean)).size===cases.length;
  const fieldScore=details.length?details.filter((item)=>item.passed).length/details.length:0;
  const schemaValid=formatValid===true&&exactCount&&allUnique&&details.every((item)=>item.passed);
  return {score:Number(fieldScore.toFixed(4)),format_valid:formatValid===true,schema_valid:schemaValid,exact_item_count:exactCount,unique_ids:allUnique,details};
}

async function localCall({organizationId,cases}){
  if(!intelligenceLocalQueueConfigured())return {deferred:true,reason:"LOCAL_QUEUE_DISABLED"};
  const health=await getIntelligenceLocalQueueHealth(); if(!health.ready)return {deferred:true,reason:"LOCAL_NODE_OFFLINE"};
  const idle=await resolveNightlyLearningLocalIdleState(); if(!idle.ready)return {deferred:true,reason:idle.online_node_count?"LOCAL_GPU_BUSY":"LOCAL_NODE_OFFLINE"};
  const prompt=[
    "Avantiqo local structured-output endurance practice. Return one JSON object only. No markdown, no prose, no chain-of-thought.",
    `Return exactly ${CASE_COUNT} answers in this schema: {\"answers\":[{\"id\":string,\"action\":string,\"status\":string,\"replay_write\":boolean,\"escalate\":boolean,\"authority_unchanged\":boolean}]}.`,
    `Allowed actions: ${ACTIONS.join(", ")}. Allowed statuses: ${STATUSES.join(", ")}.`,
    "Preserve every id exactly once and copy the expected typed decision fields from each synthetic case. Do not add keys.",
    JSON.stringify(cases),
  ].join("\n");
  const input={capability:"ai.text.generate",execution_lane:"fast",messages:[{role:"system",content:"Return strict JSON only. No markdown fences."},{role:"user",content:prompt}],temperature:0,max_output_tokens:2400,response_format:{type:"json_object"}};
  let execution=await executeService({organization_id:organizationId,bill_to_organization_id:organizationId,service_id:"ai.text.generate",provider_id:PROVIDER,capability:"ai.text.generate",input,metadata:{structured_output_practice:true,local_queue_required:true,external_fallback_allowed:false},category:"INTELLIGENCE_STRUCTURED_OUTPUT_PRACTICE",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}});
  if(execution?.pending===true&&!isIntelligenceLocalQueueJob(execution.provider_job_id)){await cancelPendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),reason:"STRUCTURED_OUTPUT_PRACTICE_NON_LOCAL_JOB_REJECTED"}).catch(()=>null);throw new Error("STRUCTURED_OUTPUT_PRACTICE_NON_LOCAL_JOB_REJECTED")}
  let settled=execution;
  for(let i=0;execution?.pending===true&&i<MAX_POLLS;i++){
    settled=await settlePendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),quantity:execution.usage?.quantity??1,unit:execution.usage?.unit||"request",metadata:{structured_output_practice:true},provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"},credential_id:execution.credential_id||null,started_at:execution.started_at||null});
    if(settled?.pending!==true)break;
    if(i>=MAX_QUEUE_WAIT_POLLS){const q=await getIntelligenceLocalQueueStatus({provider_job_id:execution.provider_job_id});if(q.status==="queued"){await cancelPendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:execution.provider_job_id,usage_id:execution.usage?.id,pricing:object(execution.pricing),reason:"STRUCTURED_OUTPUT_PRACTICE_LOCAL_QUEUE_CONTENTION"}).catch(()=>null);return {deferred:true,reason:"LOCAL_GPU_QUEUE_CONTENDED"}}}
    await sleep(POLL_MS);
  }
  if(settled?.pending===true)return {deferred:true,reason:"LOCAL_JOB_STILL_RUNNING"};
  if(settled?.success!==true)throw new Error(`STRUCTURED_OUTPUT_PRACTICE_FAILED:${text(settled?.error,400)}`);
  const out=object(settled.output),raw=object(out.raw),p=object(raw.output); const infra=text(p.infrastructure_provider||raw.infrastructure_provider,200); if(infra!==LOCAL_INFRA)throw new Error(`STRUCTURED_OUTPUT_PRACTICE_LOCAL_REQUIRED:${infra||"NONE"}`);
  const rawText=text(p.text,50000); let parsed=null; let formatValid=false; try{parsed=JSON.parse(rawText);formatValid=true}catch{}
  return {deferred:false,answers:list(object(parsed).answers),infra,format_valid:formatValid};
}

export async function runAvantiqoStructuredOutputPractice({organizationId=orgId()}={}){
  if(!organizationId)return {success:true,status:"DISABLED",reason:"LEARNING_ORGANIZATION_ID_REQUIRED",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  const latest=await supabaseAdmin.from(MEMORY_TABLE).select("id,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",ARENA_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(latest.error)throw latest.error;
  const arena=latest.data,meta=object(arena?.metadata); if(!arena)return {success:true,status:"IDLE",reason:"NO_ARENA_MEASUREMENT",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  if(meta.format_valid===true)return {success:true,status:"IDLE",reason:"LATEST_ARENA_FORMAT_ALREADY_VALID",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  const arenaFingerprint=text(meta.arena_fingerprint,100); if(!arenaFingerprint)return {success:true,status:"IDLE",reason:"ARENA_FINGERPRINT_REQUIRED",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  const fingerprint=hash(JSON.stringify({arena_fingerprint:arenaFingerprint,arena_attempt:Number(meta.arena_attempt||1),case_count:CASE_COUNT})); const key=`structured-output-practice:${fingerprint.slice(0,40)}`;
  const existing=await supabaseAdmin.from(MEMORY_TABLE).select("id").eq("organization_id",organizationId).eq("memory_scope",PRACTICE_SCOPE).eq("memory_key",key).maybeSingle(); if(existing.error)throw existing.error; if(existing.data)return {success:true,status:"IDLE",reason:"CURRENT_STRUCTURED_OUTPUT_PRACTICE_ALREADY_RUN",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  const cases=buildCases(meta.arena_attempt); const call=await localCall({organizationId,cases}); if(call.deferred)return {success:true,status:"DEFERRED",reason:call.reason,contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT};
  const grading=grade(cases,call.answers,call.format_valid); const now=new Date().toISOString();
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:PRACTICE_SCOPE,memory_key:key,memory_type:"lesson",subject:"structured_output_endurance",content:`Structured-output endurance score: ${(grading.score*100).toFixed(1)}%.`,importance:0.98,confidence:1,source:"intelligence_structured_output_practice",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT,score:grading.score,format_valid:grading.format_valid,schema_valid:grading.schema_valid,case_count:CASE_COUNT,grading,source_arena_fingerprints:[arenaFingerprint],source_arena_attempt:Number(meta.arena_attempt||1),synthetic_cases_only:true,held_out_benchmark_cases_reused:false,hidden_benchmark_answers_available:false,infrastructure_provider:call.infra,external_provider_spend_allowed:false,automatic_training_started:false,automatic_model_promotion:false,authority_effect:"NONE",raw_reasoning_persisted:false,created_at:now},updated_at:now};
  const written=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"}); if(written.error)throw written.error;
  return {success:true,status:"COMPLETED",contract:AVANTIQO_STRUCTURED_OUTPUT_PRACTICE_CONTRACT,score:grading.score,format_valid:grading.format_valid,schema_valid:grading.schema_valid,case_count:CASE_COUNT,local_only:true,external_provider_spend_allowed:false,automatic_training_started:false};
}
