import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveNightlyLearningLocalIdleState } from "@/lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime";

export const AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT =
  "AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_SCOPE = "platform_training_candidates";
const BENCHMARK_SCOPE = "platform_general_intelligence_shadow_benchmarks";
const CANDIDATE_SOURCE = "general_intelligence_training_candidate";
const CANDIDATE_KIND = "GENERAL_INTELLIGENCE_TRANSFER_DISCIPLINE";
const PROVIDER = "avantiqo-intelligence";
const MODEL = "qwen3:4b-instruct";
const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1";
const CASE_COUNT = 20;
const NO_TRAINING_THRESHOLD = 0.95;
const MAX_POLLS = 120;
const POLL_MS = 500;

function text(value, limit = 12000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function digest(value) { return createHash("sha256").update(text(value, 30000)).digest("hex"); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
function parseJson(value) { return JSON.parse(text(value, 60000).replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }

function buildCases() {
  const cases = [];
  for (let i = 0; i < 5; i += 1) {
    cases.push({ id:`supported-${i+1}`, expected:"TRANSFER_HYPOTHESIS", source_evidence:[`S${i+1}: Source mechanism depends on bounded queue capacity and measured arrival rate.`], target_evidence:[`T${i+1}: Target context has bounded service capacity and measurable arrival rate.`], analogy:`Apply the source queue mechanism to target service planning.` });
    cases.push({ id:`missing-target-${i+1}`, expected:"UNSUPPORTED_TRANSFER", source_evidence:[`S${i+1}: Source mechanism is verified in its original domain.`], target_evidence:[], analogy:`Assume the same mechanism works in a different domain without target evidence.` });
    cases.push({ id:`broken-invariant-${i+1}`, expected:"UNSUPPORTED_TRANSFER", source_evidence:[`S${i+1}: Mechanism requires conserved total flow.`], target_evidence:[`T${i+1}: Target system explicitly creates and removes flow internally.`], analogy:`Transfer the conserved-flow mechanism unchanged.` });
    cases.push({ id:`surface-analogy-${i+1}`, expected:"UNSUPPORTED_TRANSFER", source_evidence:[`S${i+1}: Source and target use similar vocabulary.`], target_evidence:[`T${i+1}: No evidence links the causal mechanisms.`], analogy:`Treat shared terminology as proof of transferable mechanism.` });
  }
  return cases;
}

function normalizeVerdict(value) {
  const verdict = text(value, 50).toUpperCase();
  return ["TRANSFER_HYPOTHESIS", "UNSUPPORTED_TRANSFER"].includes(verdict) ? verdict : "INVALID";
}

function grade(cases, answers) {
  const byId = new Map(list(answers).map((answer) => [text(answer?.id, 80), object(answer)]));
  const results = cases.map((item) => {
    const answer = byId.get(item.id) || {};
    const verdict = normalizeVerdict(answer.verdict);
    const sourceUsed = answer.source_evidence_used === true;
    const targetRequired = item.target_evidence.length > 0;
    const targetUsed = answer.target_evidence_used === true;
    const boundaries = list(answer.boundary_conditions).map((v) => text(v, 500)).filter(Boolean);
    const falsifiers = list(answer.falsifiers).map((v) => text(v, 500)).filter(Boolean);
    const verdictPass = verdict === item.expected;
    const evidencePass = sourceUsed && (!targetRequired || targetUsed);
    const disciplinePass = item.expected === "UNSUPPORTED_TRANSFER" || (boundaries.length >= 1 && falsifiers.length >= 1);
    return { id:item.id, passed:verdictPass && evidencePass && disciplinePass, verdict, expected:item.expected, verdict_pass:verdictPass, evidence_pass:evidencePass, discipline_pass:disciplinePass };
  });
  const passed = results.filter((item) => item.passed).length;
  const passRate = passed / cases.length;
  return { case_count:cases.length, passed_case_count:passed, pass_rate:Number(passRate.toFixed(4)), failed_case_count:cases.length-passed, cases:results };
}

async function callLocal({ organizationId, cases }) {
  const idle = await resolveNightlyLearningLocalIdleState();
  if (!idle.ready) return { deferred:true, reason:idle.online_node_count ? "LOCAL_GPU_BUSY" : "LOCAL_NODE_OFFLINE" };
  const prompt = [
    "Shadow benchmark for cross-domain transfer discipline. Return JSON only.",
    "For every case decide TRANSFER_HYPOTHESIS or UNSUPPORTED_TRANSFER.",
    "Analogy is never evidence. Use source and target evidence explicitly. If target evidence is missing, causal invariants fail, or only surface similarity exists, choose UNSUPPORTED_TRANSFER.",
    "For supported transfer include at least one boundary condition and one falsifier.",
    "Return answers:[{id,verdict,source_evidence_used,target_evidence_used,boundary_conditions[],falsifiers[]}]. No chain-of-thought.",
    JSON.stringify({ cases }),
  ].join("\n");
  const input = { capability:"ai.text.generate", execution_lane:"fast", messages:[{role:"system",content:"Return JSON only. No chain-of-thought."},{role:"user",content:prompt}], temperature:0, max_output_tokens:2600, response_format:{type:"json_object"} };
  let execution = await executeService({ organization_id:organizationId, bill_to_organization_id:organizationId, service_id:"ai.text.generate", provider_id:PROVIDER, capability:"ai.text.generate", input, metadata:{general_intelligence_shadow_benchmark:true,local_first:true,external_fallback_allowed:false}, category:"GENERAL_INTELLIGENCE_SHADOW_BENCHMARK", provider_policy:{allowed_providers:[PROVIDER],owned_only_required:true,external_fallback_allowed:false} });
  let settled = execution;
  for (let i=0; execution?.pending===true && i<MAX_POLLS; i+=1) {
    settled = await settlePendingService({ organization_id:organizationId, provider:PROVIDER, provider_job_id:execution.provider_job_id, usage_id:execution.usage?.id, pricing:object(execution.pricing), quantity:execution.usage?.quantity??1, unit:execution.usage?.unit||execution.pricing?.unit||"request", metadata:{general_intelligence_shadow_benchmark:true,local_first:true}, provider_status_input:{capability:"ai.text.generate",execution_lane:"fast"}, credential_id:execution.credential_id||null, started_at:execution.started_at||null });
    if (settled?.pending !== true) break;
    await sleep(POLL_MS);
  }
  if (settled?.pending === true) return { deferred:true, reason:"LOCAL_JOB_STILL_RUNNING" };
  if (settled?.success !== true) throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT}_EXECUTION_FAILED:${text(settled?.error,500)}`);
  const out=object(settled.output), nested=object(out.output), infra=text(nested.infrastructure_provider||out.infrastructure_provider,200);
  if (infra !== LOCAL_INFRA) throw new Error(`${AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT}_LOCAL_4B_REQUIRED:${infra||"NONE"}`);
  return { deferred:false, parsed:parseJson(nested.text||out.text), infra };
}

export async function runAvantiqoGeneralIntelligenceShadowBenchmark({ organizationId = learningOrganizationId() } = {}) {
  if (!organizationId) return { success:true,status:"DEFERRED",reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED",contract:AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT };
  const candidates = await supabaseAdmin.from(MEMORY_TABLE).select("id,subject,metadata,updated_at").eq("organization_id",organizationId).eq("memory_scope",TRAINING_SCOPE).eq("source",CANDIDATE_SOURCE).eq("active",true).order("updated_at",{ascending:true}).limit(100);
  if (candidates.error) throw candidates.error;
  const candidate = list(candidates.data).find((row) => {
    const metadata=object(row.metadata);
    return text(metadata.candidate_kind,120)===CANDIDATE_KIND && text(metadata.shadow_benchmark_source_fingerprint,128)!==text(metadata.source_fingerprint,128);
  });
  if (!candidate) return { success:true,status:"IDLE",reason:"NO_PENDING_SHADOW_BENCHMARK",contract:AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT };
  const metadata=object(candidate.metadata), sourceFingerprint=text(metadata.source_fingerprint,128);
  const cases=buildCases();
  const call=await callLocal({organizationId,cases});
  if (call.deferred) return { success:true,status:"DEFERRED",reason:call.reason,contract:AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT,candidate_id:candidate.id };
  const grading=grade(cases,call.parsed.answers);
  const trainingNeeded=grading.pass_rate < NO_TRAINING_THRESHOLD;
  const now=new Date().toISOString();
  const benchmarkFingerprint=digest(JSON.stringify({candidate_id:candidate.id,source_fingerprint:sourceFingerprint,grading}));
  const row={organization_id:organizationId,party_id:null,entity_id:null,conversation_id:null,source_turn_id:null,memory_scope:BENCHMARK_SCOPE,memory_key:`shadow-benchmark:${benchmarkFingerprint.slice(0,40)}`,memory_type:"assessment",subject:text(candidate.subject,300),content:`Current local 4B shadow benchmark: ${(grading.pass_rate*100).toFixed(1)}%; ${trainingNeeded?"training needed":"no training needed"}.`,importance:trainingNeeded?0.94:0.76,confidence:1,source:"general_intelligence_shadow_benchmark",active:true,valid_until:null,superseded_by:null,superseded_at:null,forgotten_at:null,metadata:{contract:AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT,candidate_id:candidate.id,source_fingerprint:sourceFingerprint,model:MODEL,infrastructure_provider:call.infra,case_count:CASE_COUNT,pass_rate:grading.pass_rate,passed_case_count:grading.passed_case_count,failed_case_count:grading.failed_case_count,training_needed:trainingNeeded,no_training_needed:!trainingNeeded,no_training_threshold:NO_TRAINING_THRESHOLD,benchmark_only:true,training_candidate_approved:false,dataset_eligibility_effect:"NONE",automatic_training_started:false,automatic_model_weight_mutation:false,automatic_model_promotion:false,customer_private_content_included:false,raw_reasoning_persisted:false,grading,created_at:now},updated_at:now};
  const written=await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"}).select("id").single(); if(written.error) throw written.error;
  const updatedMetadata={...metadata,shadow_benchmark_status:trainingNeeded?"TRAINING_NEEDED":"NO_TRAINING_NEEDED",shadow_benchmark_source_fingerprint:sourceFingerprint,shadow_benchmark_pass_rate:grading.pass_rate,shadow_benchmark_case_count:CASE_COUNT,shadow_benchmark_model:MODEL,shadow_benchmark_infrastructure_provider:call.infra,training_needed:trainingNeeded,training_need_assessed:true,training_need_assessment_effect:"MEASUREMENT_ONLY",automatic_training_started:false,automatic_model_weight_mutation:false,production_model_promotion_effect:"NONE",shadow_benchmarked_at:now};
  const updated=await supabaseAdmin.from(MEMORY_TABLE).update({metadata:updatedMetadata,updated_at:now}).eq("organization_id",organizationId).eq("memory_scope",TRAINING_SCOPE).eq("id",candidate.id).select("id").single(); if(updated.error) throw updated.error;
  return { success:true,status:"COMPLETED",contract:AVANTIQO_GENERAL_INTELLIGENCE_SHADOW_BENCHMARK_CONTRACT,candidate_id:candidate.id,pass_rate:grading.pass_rate,training_needed:trainingNeeded,no_training_needed:!trainingNeeded,local_4b:true };
}
