import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT = "AVANTIQO_ARENA_WEAKNESS_CURRICULUM_V1";
const MEMORY_TABLE = "intelligence_memories";
const ARENA_SCOPE = "platform_intelligence_arena";
const FAILURE_SCOPE = "platform_intelligence_failure_curriculum";
const CURRICULUM_SCOPE = "platform_intelligence_weakness_curriculum";

function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function hash(v){return createHash("sha256").update(text(v,50000)).digest("hex")}
function learningOrganizationId(){return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,160)}

const PRACTICE = {
  planning:"Practice dependency ordering, discriminating evidence, preserving verified work, scope discipline and exact completion tests across multi-step goals.",
  recovery:"Practice ambiguous-write recovery, idempotency, verifier-first retry policy, partial failure isolation and post-verification contradiction handling.",
  calibration:"Practice evidence-before-escalation, confidence ceilings, difficulty-vs-uncertainty separation and stronger-model escalation only after cheap evidence is exhausted.",
  governance:"Practice authority preservation, explicit authorization gates, privacy boundaries, simulation-before-mutation and no silent scope expansion.",
  evidence:"Practice stale-data detection, source reconciliation, freshness requirements and conflict resolution before conclusions.",
  completion:"Practice independent business-effect verification and never treating transport/tool success as goal completion.",
  tool_selection:"Practice selecting exact registered capabilities and registered verifiers without inventing tools or bypassing contracts.",
  correctness:"Practice missing-input detection, counterfactual testing and cheapest discriminating reads before material decisions.",
  cost:"Practice value-of-information, low-value uncertainty deferral and cheap authoritative evidence before expensive cognition.",
  latency:"Practice fast authoritative paths for low-risk current reads and avoid deep reasoning when it adds no decision value.",
  invention:"Practice governed capability-gap proposals with mechanism hypotheses, safe experiments and no direct self-modification.",
};

export async function reconcileAvantiqoArenaWeaknessCurriculum({organizationId=learningOrganizationId()}={}){
  if(!organizationId)return {success:true,status:"DISABLED",reason:"LEARNING_ORGANIZATION_ID_REQUIRED",contract:AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT};
  const arena=await supabaseAdmin.from(MEMORY_TABLE).select("id,memory_key,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",ARENA_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(arena.error)throw arena.error;
  if(!arena.data)return {success:true,status:"IDLE",reason:"NO_ARENA_BASELINE",contract:AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT};
  const meta=object(arena.data.metadata), fingerprint=text(meta.arena_fingerprint,100), byDimension=object(meta.grading?.by_dimension||meta.by_dimension);
  const [failures,existingCurricula]=await Promise.all([
    supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",FAILURE_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(200),
    supabaseAdmin.from(MEMORY_TABLE).select("id,memory_key,subject,active,metadata").eq("organization_id",organizationId).eq("memory_scope",CURRICULUM_SCOPE).eq("source","intelligence_arena_weakness_curriculum").limit(100),
  ]);
  if(failures.error)throw failures.error;if(existingCurricula.error)throw existingCurricula.error;
  const matching=list(failures.data).filter(r=>text(object(r.metadata).arena_fingerprint,100)===fingerprint);
  const ranked=Object.entries(byDimension).map(([dimension,v])=>({dimension,score:Number(object(v).score??1)})).filter(x=>Number.isFinite(x.score)&&x.score<0.85).sort((a,b)=>a.score-b.score||a.dimension.localeCompare(b.dimension)).slice(0,3);
  if(!ranked.length)return {success:true,status:"IDLE",reason:"NO_MEASURED_WEAKNESS",contract:AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT};
  const now=new Date().toISOString();
  const rows=ranked.map(({dimension,score},index)=>{
    const failedFields=[...new Set(matching.filter(r=>r.subject===dimension).flatMap(r=>list(object(r.metadata).failed_fields).map(x=>text(x,80))).filter(Boolean))];
    return {organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:CURRICULUM_SCOPE,memory_key:`arena-weakness:${hash(`${fingerprint}:${dimension}`).slice(0,40)}`,memory_type:"goal",subject:dimension,content:PRACTICE[dimension]||`Practice robust ${dimension} reasoning using fresh synthetic cases without benchmark answer exposure.`,importance:0.995-index*0.005,confidence:1,source:"intelligence_arena_weakness_curriculum",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT,arena_fingerprint:fingerprint,arena_attempt:Number(meta.arena_attempt||1),arena_version:meta.arena_version||null,dimension,measured_score:score,failed_fields:failedFields,practice_mode:"LOCAL_SYNTHETIC_ONLY",hidden_benchmark_answer_available:false,benchmark_case_text_reused:false,external_research_allowed:false,external_provider_spend_allowed:false,automatic_training_started:false,automatic_model_promotion:false,authorization_value:"none",created_at:now},updated_at:now};
  });
  const selectedKeys=new Set(rows.map(r=>r.memory_key));
  const retireIds=list(existingCurricula.data).filter(r=>r.active===true&&!selectedKeys.has(r.memory_key)).map(r=>r.id).filter(Boolean);
  if(retireIds.length){const retired=await supabaseAdmin.from(MEMORY_TABLE).update({active:false,superseded_at:now,updated_at:now}).eq("organization_id",organizationId).eq("memory_scope",CURRICULUM_SCOPE).in("id",retireIds);if(retired.error)throw retired.error}
  const written=await supabaseAdmin.from(MEMORY_TABLE).upsert(rows,{onConflict:"organization_id,memory_scope,memory_key"}).select("id"); if(written.error)throw written.error;
  return {success:true,status:"WEAKNESS_CURRICULUM_READY",contract:AVANTIQO_ARENA_WEAKNESS_CURRICULUM_CONTRACT,arena_fingerprint:fingerprint,arena_attempt:Number(meta.arena_attempt||1),selected_dimensions:ranked,retired_stale_dimension_count:retireIds.length,local_synthetic_only:true,hidden_benchmark_answers_exposed:false,external_provider_spend_allowed:false,automatic_training_started:false};
}
