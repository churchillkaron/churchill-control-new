#!/usr/bin/env node
import { createHash } from "node:crypto";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_LEARNING_SYNTHESIS_LOCAL_FIRST_V1";
const PROGRAM_SCOPE = "platform_learning_discovery_programs";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses";
const MEMORY_TABLE = "intelligence_memories";
const PROVIDER = "avantiqo-intelligence";
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function sha(v){return createHash("sha256").update(String(v??"")).digest("hex")}
function required(name){const v=text(process.env[name],10000);if(!v)throw new Error(`${CONTRACT}_${name}_REQUIRED`);return v}
function profile(metadata){
  const mode=text(metadata.research_mode,40);
  if(mode==="mechanism") return {lane:"fast",service:"ai.text.generate",capability:"ai.text.generate",local:true,model:"qwen3:4b-instruct"};
  if(mode==="invention") return {lane:"deep",service:"ai.reasoning.execute",capability:"ai.reasoning.execute",local:false,model:"Qwen/Qwen3-30B-A3B-Thinking-2507"};
  throw new Error(`${CONTRACT}_UNSUPPORTED_MODE:${mode||"NONE"}`);
}
function systemPrompt(mode, req){return [
  "You are Avantiqo's mechanism-first learning scientist.",
  "Use only the supplied verified evidence. Do not invent evidence.",
  "Produce concise structured synthesis, not chain-of-thought.",
  "Generate falsifiable hypotheses and discriminating experiments.",
  `Research mode: ${mode}.`,
  `Minimum mechanisms: ${Number(req.minimum_mechanisms||1)}.`,
  `Minimum hypotheses: ${Number(req.minimum_hypotheses||1)}.`,
  `Minimum experiments: ${Number(req.minimum_experiments||1)}.`,
  "Return JSON with synthesis_summary, problem_decomposition, mechanisms, constraints, hypotheses, experiments, analogies, solution_directions, unresolved_questions."
].join("\n")}
function parseJson(v){const s=text(v,60000).replace(/^```json\s*/i,"").replace(/```$/i,"").trim();return JSON.parse(s)}
async function main(){
  const {supabaseAdmin:db}=await import("@/lib/shared/supabase/admin");
  const {executeService,settlePendingService}=await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");
  const org=required("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID");
  const topic=text(process.env.AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_TOPIC_KEY,240);
  let q=db.from(MEMORY_TABLE).select("*").eq("organization_id",org).eq("memory_scope",PROGRAM_SCOPE).eq("active",true).eq("metadata->>status","READY_FOR_SYNTHESIS").order("importance",{ascending:false}).limit(10);
  if(topic) q=q.eq("subject",topic);
  const qr=await q;if(qr.error)throw qr.error;
  const programs=list(qr.data).filter(r=>object(r.metadata).evidence_ready_for_synthesis===true);
  if(programs.length!==1) throw new Error(`${CONTRACT}_EXACTLY_ONE_READY_PROGRAM_REQUIRED:${programs.length}`);
  const program=programs[0], meta=object(program.metadata), p=profile(meta);
  const keys=new Set(list(meta.track_state).map(x=>text(x?.topic_key,240)).filter(Boolean));
  const er=await db.from(MEMORY_TABLE).select("subject,content,confidence,metadata,updated_at").eq("organization_id",org).eq("memory_scope",KNOWLEDGE_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(5000);if(er.error)throw er.error;
  const evidence=list(er.data).filter(r=>keys.has(text(object(r.metadata).topic_key,240))).filter(r=>object(r.metadata).customer_private_memory!==true).filter(r=>Number(r.confidence||0)>=0.72).slice(0,80).map(r=>({topic_key:text(object(r.metadata).topic_key,240),claim:text(r.content,1800),confidence:Number(r.confidence||0)}));
  if(!evidence.length) throw new Error(`${CONTRACT}_VERIFIED_EVIDENCE_REQUIRED`);
  const input={capability:p.capability,execution_lane:p.lane,messages:[{role:"system",content:systemPrompt(meta.research_mode,object(meta.requirements))},{role:"user",content:JSON.stringify({objective:text(program.subject,240),verified_evidence:evidence})}],temperature:0.2,max_output_tokens:p.local?2200:3600,response_format:{type:"json_object"}};
  const ex=await executeService({organization_id:org,bill_to_organization_id:org,service_id:p.service,provider_id:PROVIDER,capability:p.capability,input,metadata:{learning_synthesis_contract:CONTRACT,local_first:p.local,external_fallback_allowed:!p.local,raw_reasoning_persistence_forbidden:true},category:"LEARNING_SYNTHESIS",provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false}});
  let settled=ex;
  if(ex?.pending===true){settled=await settlePendingService({organization_id:org,provider:PROVIDER,provider_job_id:ex.provider_job_id,usage_id:ex.usage?.id,pricing:object(ex.pricing),quantity:ex.usage?.quantity??1,unit:ex.usage?.unit||ex.pricing?.unit||"request",metadata:{learning_synthesis_contract:CONTRACT,local_first:p.local,raw_reasoning_persisted:false},provider_status_input:{capability:p.capability,execution_lane:p.lane},credential_id:ex.credential_id||null,started_at:ex.started_at||null});}
  if(settled?.success!==true) throw new Error(`${CONTRACT}_EXECUTION_FAILED:${text(settled?.error,500)}`);
  const out=object(settled.output);const output=object(out.output);const raw=text(output.text||out.text,60000);if(!raw)throw new Error(`${CONTRACT}_OUTPUT_REQUIRED`);
  const synthesis=parseJson(raw);const fp=sha(JSON.stringify(synthesis));const now=new Date().toISOString();
  const infra=text(output.infrastructure_provider||out.infrastructure_provider,200)||null;
  if(p.local && infra!=="AVANTIQO_LOCAL_NODE_V1") throw new Error(`${CONTRACT}_LOCAL_4B_REQUIRED:${infra||"NONE"}`);
  const row={organization_id:org,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:SYNTHESIS_SCOPE,memory_key:`mechanism-synthesis:${fp.slice(0,40)}`,memory_type:"lesson",subject:text(program.subject,240),content:text(synthesis.synthesis_summary,4000)||"Learning synthesis completed.",importance:Number(program.importance||0.8),confidence:0.8,source:p.local?"local_4b_learning_synthesis":"deep_learning_synthesis",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:CONTRACT,root_topic_key:text(program.subject,240),research_mode:meta.research_mode,synthesis_fingerprint:fp,synthesis,evidence_claim_count:evidence.length,provider:PROVIDER,model:p.model,infrastructure_provider:infra,execution_lane:p.lane,local_4b:p.local,experiment_execution_performed:false,model_training_performed:false,production_promotion_performed:false,raw_reasoning_persisted:false,created_at:now},updated_at:now};
  const wr=await db.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"});if(wr.error)throw wr.error;
  const next={...meta,status:"SYNTHESIS_READY_FOR_EXPERIMENT_GOVERNANCE",synthesis_completed_at:now,synthesis_fingerprint:fp,synthesis_local_4b:p.local,synthesis_execution_lane:p.lane,synthesis_runtime_contract:p.local?"AVANTIQO_LOCAL_NODE_V1":"AVANTIQO_INTELLIGENCE_MODAL_H100_V1",automatic_experiment_execution:false,automatic_training_started:false,automatic_model_promotion:false};
  const ur=await db.from(MEMORY_TABLE).update({metadata:next,updated_at:now}).eq("organization_id",org).eq("id",program.id);if(ur.error)throw ur.error;
  console.log(JSON.stringify({success:true,contract:CONTRACT,topic_key:program.subject,research_mode:meta.research_mode,execution_lane:p.lane,local_4b:p.local,infrastructure_provider:infra,evidence_claim_count:evidence.length},null,2));
}
await main();
