import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveAvantiqoLearningOrganization } from "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime";
import { observeVerifiedExecutionSuccess } from "@/lib/operator/runtime/IntelligenceFailureLearningPolicy";

export const AVANTIQO_VERIFIED_OUTCOME_BACKFILL_CONTRACT = "AVANTIQO_VERIFIED_OUTCOME_BACKFILL_V1";
const MEMORY_TABLE = "intelligence_memories";
const TURN_TABLE = "intelligence_turns";
const OUTCOME_SCOPE = "platform_learning_outcomes";
const RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v:[]}
function hash(v){return createHash("sha256").update(text(v,50000)).digest("hex")}
function capabilityMode(execution={}){return text(execution?.capability?.mode,80).toLowerCase()||null}
function capabilityDomain(key){const normalized=text(key,300).toLowerCase().replace(/[:/]/g,".");return normalized.split(".").filter(Boolean)[0]||null}
function memoryKey(turnId){return `verified-outcome-backfill:${hash(turnId).slice(0,40)}`}

export async function backfillAvantiqoVerifiedExecutionOutcomes({limit=5000}={}){
  const resolved=await resolveAvantiqoLearningOrganization({allowDatabaseFallback:true});
  const learningOrganizationId=text(resolved?.organization_id,160);
  if(!learningOrganizationId)return {success:true,status:"DISABLED",reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED",contract:AVANTIQO_VERIFIED_OUTCOME_BACKFILL_CONTRACT};
  const turns=await supabaseAdmin.from(TURN_TABLE).select("id,created_at,execution").eq("role","assistant").not("execution","is",null).order("created_at",{ascending:true}).limit(Math.max(1,Math.min(20000,Number(limit)||5000)));
  if(turns.error)throw turns.error;
  const candidates=[];
  for(const turn of list(turns.data)){
    const execution=object(turn.execution), observation=observeVerifiedExecutionSuccess(execution);
    if(!observation)continue;
    const observedAt=text(turn.created_at,80)||new Date().toISOString();
    const observedMs=Date.parse(observedAt);const validUntil=new Date((Number.isFinite(observedMs)?observedMs:Date.now())+RETENTION_DAYS*DAY_MS).toISOString();
    candidates.push({organization_id:learningOrganizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:OUTCOME_SCOPE,memory_key:memoryKey(turn.id),memory_type:"completed_step",subject:observation.capability_key,content:`Verified successful execution outcome observed for ${observation.capability_key}.`,importance:0.62,confidence:1,source:"verified_execution_outcome_backfill",active:true,valid_until:validUntil,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_VERIFIED_OUTCOME_BACKFILL_CONTRACT,outcome:"VERIFIED_SUCCESS",capability_key:observation.capability_key,capability_domain:capabilityDomain(observation.capability_key),capability_mode:capabilityMode(execution),verification_mode:observation.verification_mode,failure_fingerprint:null,observed_at:observedAt,backfilled_from_historical_verified_execution:true,structural_outcome_only:true,customer_private_content_included:false,customer_identifiers_included:false,source_organization_id_persisted:false,source_party_id_persisted:false,source_conversation_id_persisted:false,source_turn_id_persisted:false,raw_payload_persisted:false,raw_output_persisted:false,raw_reasoning_persisted:false,raw_failure_reason_persisted:false,training_ready:false,automatic_training_effect:"NONE",production_model_promotion_effect:"NONE",authorization_value:"none"},updated_at:new Date().toISOString()});
  }
  if(!candidates.length)return {success:true,status:"IDLE",reason:"NO_QUALIFYING_HISTORICAL_OUTCOMES",contract:AVANTIQO_VERIFIED_OUTCOME_BACKFILL_CONTRACT,qualifying_count:0,written_count:0};
  const keys=candidates.map(r=>r.memory_key);const existing=await supabaseAdmin.from(MEMORY_TABLE).select("memory_key").eq("organization_id",learningOrganizationId).eq("memory_scope",OUTCOME_SCOPE).in("memory_key",keys);if(existing.error)throw existing.error;
  const existingKeys=new Set(list(existing.data).map(r=>text(r.memory_key,160)));const rows=candidates.filter(r=>!existingKeys.has(r.memory_key));
  if(rows.length){const written=await supabaseAdmin.from(MEMORY_TABLE).insert(rows).select("id");if(written.error)throw written.error}
  return {success:true,status:rows.length?"COMPLETED":"IDLE",reason:rows.length?null:"HISTORICAL_OUTCOMES_ALREADY_BACKFILLED",contract:AVANTIQO_VERIFIED_OUTCOME_BACKFILL_CONTRACT,qualifying_count:candidates.length,written_count:rows.length,already_present_count:candidates.length-rows.length,verified_reads_only:candidates.every(r=>r.metadata.capability_mode==="read"),writes_without_independent_verification_excluded:true,authority_effect:"NONE",automatic_training_started:false,automatic_model_promotion:false};
}
