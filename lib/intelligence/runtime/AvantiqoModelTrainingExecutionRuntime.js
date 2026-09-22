import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { certifyAvantiqoModelTrainingReadiness } from "./AvantiqoModelTrainingReadinessRuntime.js";

export const AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT = "AVANTIQO_MODEL_TRAINING_EXECUTION_V4_LOCAL_QUEUE";
const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_model_training_jobs";
const JOB_PREFIX = "local-training:";
const CAPABILITY = "ai.model.train";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function encoded(id) { return `${JOB_PREFIX}${id}`; }
function raw(value) { const id=text(value,200); if(!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_TRAINING_JOB_ID_REQUIRED"); return id.slice(JOB_PREFIX.length); }

async function localTrainingNodeReady() {
  const result=await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",[CAPABILITY]).order("last_seen_at",{ascending:false}).limit(4);
  if(result.error) throw result.error;
  const now=Date.now();
  return (result.data||[]).some((node)=>{const seen=new Date(node.last_seen_at||0).getTime(); return Number.isFinite(seen) && now-seen<=90000;});
}

async function loadTrainingMaterial(trainingJobRecordId) {
  const job=await supabaseAdmin.from(MEMORY_TABLE).select("id,organization_id,subject,metadata").eq("id",trainingJobRecordId).eq("memory_scope",TRAINING_SCOPE).eq("active",true).maybeSingle();
  if(job.error) throw job.error;
  if(!job.data) throw new Error("AVANTIQO_LOCAL_TRAINING_PREPARED_JOB_NOT_FOUND");
  const metadata=object(job.data.metadata);
  const ids=[...new Set([...list(metadata.train_example_ids),...list(metadata.holdout_example_ids)].map((v)=>text(v,160)).filter(Boolean))];
  const rows=ids.length ? await supabaseAdmin.from(MEMORY_TABLE).select("id,content,metadata").in("id",ids).eq("memory_scope","platform_training_examples").eq("active",true) : {data:[],error:null};
  if(rows.error) throw rows.error;
  const byId=new Map((rows.data||[]).map((row)=>[String(row.id),row]));
  function compile(exampleIds, split) {
    return exampleIds.map((id)=>byId.get(String(id))).filter(Boolean).map((row)=>{
      const meta=object(row.metadata);
      if(meta.synthetic!==true || meta.training_example_validated!==true || meta.customer_private_content_included!==false) throw new Error("AVANTIQO_LOCAL_TRAINING_EXAMPLE_PRIVACY_INVALID");
      const parsed=JSON.parse(String(row.content||"{}"));
      return { id:row.id, split, user_task:text(parsed.user_task,3000), assistant_target:text(parsed.assistant_target,5000), evaluation_requirements:list(parsed.evaluation_requirements).map((v)=>text(v,700)).filter(Boolean) };
    });
  }
  return {
    organizationId:job.data.organization_id,
    job:job.data,
    metadata,
    train:compile(list(metadata.train_example_ids),"train"),
    holdout:compile(list(metadata.holdout_example_ids),"holdout"),
  };
}

export async function submitAvantiqoModelTrainingJob({ trainingJobId, approved = false } = {}) {
  if (approved !== true) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXPLICIT_APPROVAL_REQUIRED");
  const readiness=await certifyAvantiqoModelTrainingReadiness({trainingJobId});
  if(readiness.status!=="READY_FOR_RESOURCE_PREFLIGHT") throw new Error("AVANTIQO_LOCAL_TRAINING_READINESS_REQUIRED");
  if(!(await localTrainingNodeReady())) throw new Error("AVANTIQO_LOCAL_TRAINING_NODE_UNAVAILABLE");
  const material=await loadTrainingMaterial(readiness.training_job_record_id);
  if(!material.train.length || !material.holdout.length) throw new Error("AVANTIQO_LOCAL_TRAINING_EXAMPLES_REQUIRED");
  const foundationModel=text(process.env.AVANTIQO_INTELLIGENCE_TRAINING_FOUNDATION_MODEL || material.metadata.foundation_model || "Qwen/Qwen3-4B",300);
  const payload={
    contract:AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
    training_job_record_id:material.job.id,
    training_job_id:text(material.metadata.job_id || material.job.subject,200),
    foundation_model:foundationModel,
    recipe:{...object(material.metadata.recipe), execution_backend:"AVANTIQO_LOCAL_NODE_TRAINER_V1", local_only:true},
    train_examples:material.train,
    holdout_examples:material.holdout,
    artifact_name:`${text(material.metadata.job_id || material.job.subject,120)}-adapter`,
    checkpoint_interval_steps:25,
    customer_private_content_included:false,
    raw_reasoning_training_allowed:false,
    production_model_promotion_effect:"NONE",
  };
  const inserted=await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({organization_id:material.organizationId,usage_id:`model-training:${text(material.metadata.job_id||material.job.subject,160)}`,capability:CAPABILITY,lane:"training",workload:"model_training",model:foundationModel,payload,priority:-100,max_attempts:1}).select("id").single();
  if(inserted.error||!inserted.data?.id) throw inserted.error||new Error("AVANTIQO_LOCAL_TRAINING_QUEUE_INSERT_FAILED");
  const providerJobId=encoded(inserted.data.id);
  await supabaseAdmin.from(MEMORY_TABLE).update({metadata:{...material.metadata,status:"QUEUED_LOCAL_TRAINING",training_execution_authorized:true,automatic_training_started:false,local_provider_job_id:providerJobId,execution_backend:"AVANTIQO_LOCAL_NODE_TRAINER_V1",updated_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",material.job.id);
  return {success:true,contract:AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,status:"QUEUED",provider_job_id:providerJobId,infrastructure_provider:INFRASTRUCTURE,local_only:true,modal_fallback_allowed:false};
}

export async function refreshAvantiqoModelTrainingJob({ providerJobId, jobId } = {}) {
  const id=raw(providerJobId||jobId);
  const result=await supabaseAdmin.from("avantiqo_local_compute_jobs").select("id,status,result,metrics,error_code,node_id,started_at,completed_at,updated_at").eq("id",id).maybeSingle();
  if(result.error) throw result.error;
  if(!result.data) return {status:"failed",provider_job_id:encoded(id),error:"AVANTIQO_LOCAL_TRAINING_JOB_NOT_FOUND"};
  const status=text(result.data.status,40).toUpperCase();
  return {status:status==="COMPLETED"?"completed":status==="RUNNING"?"processing":status==="QUEUED"?"queued":"failed",provider_job_id:encoded(id),infrastructure_provider:INFRASTRUCTURE,local_only:true,node_id:result.data.node_id||null,result:object(result.data.result),metrics:object(result.data.metrics),error:result.data.error_code||null,started_at:result.data.started_at||null,completed_at:result.data.completed_at||null};
}

export const AvantiqoModelTrainingExecutionRuntime=Object.freeze({contract:AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,infrastructure_provider:INFRASTRUCTURE,local_only:true,modal_fallback_allowed:false,execution_available:true,submit:submitAvantiqoModelTrainingJob,refresh:refreshAvantiqoModelTrainingJob});
