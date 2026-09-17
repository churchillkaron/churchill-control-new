import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const CONTRACT = "AVANTIQO_NIGHTLY_LOCAL_LEARNING_V1";
const PROGRAM_SCOPE = "platform_learning_discovery_programs";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses";
const MEMORY_TABLE = "intelligence_memories";
const PROVIDER = "avantiqo-intelligence";
const MODEL = "qwen3:4b-instruct";
const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1";
const MAX_POLLS = 240;
const POLL_MS = 500;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sha(v){return createHash("sha256").update(String(v??"")).digest("hex")}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

export async function resolveNightlyLearningLocalIdleState(){
  const now = new Date();
  const nodes = await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",["ai.text.generate"]).order("last_seen_at",{ascending:false}).limit(8);
  if(nodes.error) throw nodes.error;
  const online = list(nodes.data).filter(n=>Number.isFinite(new Date(n.last_seen_at||0).getTime()) && now.getTime()-new Date(n.last_seen_at).getTime()<=90000);
  const jobs = await supabaseAdmin.from("avantiqo_local_compute_jobs").select("id,status,lane,priority,available_at,created_at").in("status",["QUEUED","RUNNING"]).order("priority",{ascending:false}).order("created_at",{ascending:true}).limit(20);
  if(jobs.error) throw jobs.error;
  const blocking = list(jobs.data).filter(j=>j.status==="RUNNING" || (j.status==="QUEUED" && new Date(j.available_at||0)<=now));
  return { ready: online.length>0 && blocking.length===0, online_node_count: online.length, blocking_job_count:blocking.length, blocking_jobs:blocking.slice(0,5) };
}

function prompt(meta){
  const req=object(meta.requirements);
  return ["You are Avantiqo's mechanism-first learning scientist.","Use only supplied verified evidence; do not invent evidence.","Return concise JSON, never chain-of-thought.","Generate falsifiable hypotheses and discriminating experiments.",`Minimum mechanisms: ${Number(req.minimum_mechanisms||1)}.`,`Minimum hypotheses: ${Number(req.minimum_hypotheses||1)}.`,`Minimum experiments: ${Number(req.minimum_experiments||1)}.`,"Return JSON with synthesis_summary, problem_decomposition, mechanisms, constraints, hypotheses, experiments, analogies, solution_directions, unresolved_questions."].join("\n");
}
function parseJson(v){return JSON.parse(text(v,60000).replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}

export async function runAvantiqoNightlyLearningSynthesis({ organizationId = text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID) } = {}){
  if(!organizationId) return {success:true,status:"DEFERRED",reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED",contract:CONTRACT};
  const idle=await resolveNightlyLearningLocalIdleState();
  if(!idle.ready) return {success:true,status:"DEFERRED",reason:idle.online_node_count?"LOCAL_GPU_BUSY":"LOCAL_NODE_OFFLINE",contract:CONTRACT,idle};
  const qr=await supabaseAdmin.from(MEMORY_TABLE).select("*").eq("organization_id",organizationId).eq("memory_scope",PROGRAM_SCOPE).eq("active",true).eq("metadata->>status","READY_FOR_SYNTHESIS").order("importance",{ascending:false}).limit(20);
  if(qr.error) throw qr.error;
  const program=list(qr.data).find(r=>object(r.metadata).evidence_ready_for_synthesis===true && text(object(r.metadata).research_mode,40)==="mechanism");
  const deepWaiting=list(qr.data).filter(r=>object(r.metadata).evidence_ready_for_synthesis===true && text(object(r.metadata).research_mode,40)==="invention").length;
  if(!program) return {success:true,status:"IDLE",reason:"NO_LOCAL_4B_SYNTHESIS_READY",contract:CONTRACT,deep_invention_waiting:deepWaiting,idle};
  const meta=object(program.metadata); const keys=new Set(list(meta.track_state).map(x=>text(x?.topic_key,240)).filter(Boolean));
  const er=await supabaseAdmin.from(MEMORY_TABLE).select("content,confidence,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",KNOWLEDGE_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(5000);
  if(er.error) throw er.error;
  const evidence=list(er.data).filter(r=>keys.has(text(object(r.metadata).topic_key,240))).filter(r=>object(r.metadata).customer_private_memory!==true).filter(r=>Number(r.confidence||0)>=0.72).slice(0,80).map(r=>({topic_key:text(object(r.metadata).topic_key,240),claim:text(r.content,1800),confidence:Number(r.confidence||0)}));
  if(!evidence.length) return {success:true,status:"DEFERRED",reason:"VERIFIED_EVIDENCE_REQUIRED",contract:CONTRACT,topic_key:program.subject};
  const input={capability:"ai.text.generate",execution_lane:"fast",messages:[{role:"system",content:prompt(meta)},{role:"user",content:JSON.stringify({objective:text(program.subject,240),verified_evidence:evidence})}],temperature:0.2,max_output_tokens:2200,response_format:{type:"json_object"}};
  let ex=await executeService({organization_id:organizationId,bill_to_organization_id:organizationId,service_id:"ai.text.generate",provider_id:PROVIDER,capability:"ai.text.generate",input,metadata:{learning_synthesis_contract:CONTRACT,nightly:true,local_first:true,external_fallback_allowed:false,raw_reasoning_persistence_forbidden:true},category:"LEARNING_SYNTHESIS",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}});
  let settled=ex;
  for(let i=0; ex?.pending===true && i<MAX_POLLS; i++){
    settled=await settlePendingService({organization_id:organizationId,provider:PROVIDER,provider_job_id:ex.provider_job_id,usage_id:ex.usage?.id,pricing:object(ex.pricing),quantity:ex.usage?.quantity??1,unit:ex.usage?.unit||ex.pricing?.unit||"request",metadata:{learning_synthesis_contract:CONTRACT,nightly:true,local_first:true,raw_reasoning_persisted:false},provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"},credential_id:ex.credential_id||null,started_at:ex.started_at||null});
    if(settled?.pending!==true) break; await sleep(POLL_MS);
  }
  if(settled?.pending===true) return {success:true,status:"DEFERRED",reason:"LOCAL_JOB_STILL_RUNNING",contract:CONTRACT,topic_key:program.subject};
  if(settled?.success!==true) throw new Error(`${CONTRACT}_EXECUTION_FAILED:${text(settled?.error,500)}`);
  const out=object(settled.output), nested=object(out.output), raw=text(nested.text||out.text,60000), infra=text(nested.infrastructure_provider||out.infrastructure_provider,200);
  if(infra!==LOCAL_INFRA) throw new Error(`${CONTRACT}_LOCAL_4B_REQUIRED:${infra||"NONE"}`);
  const synthesis=parseJson(raw), fp=sha(JSON.stringify(synthesis)), now=new Date().toISOString();
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:SYNTHESIS_SCOPE,memory_key:`mechanism-synthesis:${fp.slice(0,40)}`,memory_type:"lesson",subject:text(program.subject,240),content:text(synthesis.synthesis_summary,4000)||"Learning synthesis completed.",importance:Number(program.importance||0.8),confidence:0.8,source:"nightly_local_4b_learning_synthesis",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:CONTRACT,root_topic_key:text(program.subject,240),research_mode:"mechanism",synthesis_fingerprint:fp,synthesis,evidence_claim_count:evidence.length,provider:PROVIDER,model:MODEL,infrastructure_provider:infra,execution_lane:"fast",local_4b:true,experiment_execution_performed:false,model_training_performed:false,production_promotion_performed:false,raw_reasoning_persisted:false,created_at:now},updated_at:now};
  const wr=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"}); if(wr.error) throw wr.error;
  const next={...meta,status:"SYNTHESIS_READY_FOR_EXPERIMENT_GOVERNANCE",synthesis_completed_at:now,synthesis_fingerprint:fp,synthesis_local_4b:true,synthesis_execution_lane:"fast",synthesis_runtime_contract:LOCAL_INFRA,automatic_experiment_execution:false,automatic_training_started:false,automatic_model_promotion:false};
  const ur=await supabaseAdmin.from(MEMORY_TABLE).update({metadata:next,updated_at:now}).eq("organization_id",organizationId).eq("id",program.id); if(ur.error) throw ur.error;
  return {success:true,status:"COMPLETED",contract:CONTRACT,topic_key:program.subject,local_4b:true,model:MODEL,infrastructure_provider:infra,evidence_claim_count:evidence.length,deep_invention_waiting:deepWaiting};
}
