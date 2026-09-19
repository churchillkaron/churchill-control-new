import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { summarizeAvantiqoVerifiedExecutionOutcomes } from "@/lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime";

export const AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT = "AVANTIQO_VERIFIED_OUTCOME_PATTERN_V1";
const MEMORY_TABLE = "intelligence_memories";
const PATTERN_SCOPE = "platform_verified_outcome_patterns";

function text(value, limit = 12000) { return String(value ?? "").trim().slice(0, limit); }
function list(value) { return Array.isArray(value) ? value : []; }
function hash(value) { return createHash("sha256").update(text(value,50000)).digest("hex"); }
function orgId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,160); }

function patternClass(summary) {
  if (summary.total_verified_outcomes < 3) return "INSUFFICIENT_VERIFIED_OUTCOMES";
  if (summary.verified_failure_count >= 2 && summary.smoothed_success_rate < 0.7) return "REPEATED_FAILURE_RISK";
  if (summary.total_verified_outcomes >= 10 && summary.success_rate >= 0.98) return "STRONG_VERIFIED_RELIABILITY";
  return "MIXED_VERIFIED_HISTORY";
}

export async function reconcileAvantiqoVerifiedOutcomePatterns({ organizationId = orgId() } = {}) {
  if (!organizationId) return { success:true, status:"DISABLED", reason:"LEARNING_ORGANIZATION_ID_REQUIRED", contract:AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT };
  const outcome = await summarizeAvantiqoVerifiedExecutionOutcomes({ organizationId });
  const summaries = list(outcome.summaries);
  if (!summaries.length) return { success:true, status:"IDLE", reason:"NO_VERIFIED_OUTCOMES", contract:AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT, verified_outcome_count:0 };
  const now = new Date().toISOString();
  let written = 0;
  for (const summary of summaries.slice(0,200)) {
    const pattern = patternClass(summary);
    const fingerprint = hash(JSON.stringify({
      capability_key: summary.capability_key,
      total: summary.total_verified_outcomes,
      success: summary.verified_success_count,
      failure: summary.verified_failure_count,
      failure_families: summary.failure_fingerprints,
      last_observed_at: summary.last_observed_at,
    }));
    const row = {
      organization_id: organizationId, party_id:null, entity_id:null, conversation_id:null, source_turn_id:null,
      memory_scope: PATTERN_SCOPE,
      memory_key: `verified-outcome-pattern:${hash(summary.capability_key).slice(0,24)}`,
      memory_type: "lesson",
      subject: summary.capability_key,
      content: `Verified outcome aggregate: ${pattern}.`,
      importance: pattern === "REPEATED_FAILURE_RISK" ? 0.95 : 0.72,
      confidence: summary.total_verified_outcomes >= 5 ? 0.9 : 0.72,
      source: "verified_outcome_pattern_learning",
      active: true, valid_until:null, superseded_by:null, superseded_at:null, forgotten_at:null,
      metadata: {
        contract: AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT,
        pattern_class: pattern,
        pattern_fingerprint: fingerprint,
        capability_key: summary.capability_key,
        capability_domain: summary.capability_domain,
        total_verified_outcomes: summary.total_verified_outcomes,
        verified_success_count: summary.verified_success_count,
        verified_failure_count: summary.verified_failure_count,
        smoothed_success_rate: summary.smoothed_success_rate,
        failure_family_count: summary.failure_family_count,
        calibration_signal_only: true,
        universal_truth_claimed: false,
        direct_execution_authority: false,
        customer_private_content_included: false,
        customer_identifiers_included: false,
        raw_payload_persisted: false,
        raw_output_persisted: false,
        raw_reasoning_persisted: false,
        automatic_training_started: false,
        automatic_model_promotion: false,
        created_at: now,
      },
      updated_at: now,
    };
    const result = await supabaseAdmin.from(MEMORY_TABLE).upsert(row,{onConflict:"organization_id,memory_scope,memory_key"});
    if (result.error) throw result.error;
    written += 1;
  }
  return { success:true, status:"COMPLETED", contract:AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT, capability_pattern_count:written, observed_row_count:outcome.observed_row_count, customer_private_content_reused:false, automatic_training_started:false, automatic_model_promotion:false };
}

export const AvantiqoVerifiedOutcomePatternRuntime = Object.freeze({ contract:AVANTIQO_VERIFIED_OUTCOME_PATTERN_CONTRACT, reconcile:reconcileAvantiqoVerifiedOutcomePatterns });
