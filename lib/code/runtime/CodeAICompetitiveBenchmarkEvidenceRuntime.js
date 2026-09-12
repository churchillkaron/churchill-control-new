import crypto from "node:crypto";

import { supabaseAdmin } from "../../shared/supabase/admin.js";
import {
  resolveAvantiqoLearningOrganization,
} from "../../intelligence/runtime/AvantiqoLearningOrganizationRuntime.js";

export const CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_EVIDENCE_V1";
export const CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
export const CODE_AI_COMPETITIVE_IMPROVEMENT_BACKLOG_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "platform_code_competitive_benchmark_evidence";
const MEMORY_SOURCE = "code_ai_competitive_benchmark_evidence_runtime";
const MAX_REPORT_AGE_DAYS = 30;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function reportAgeDays(value) {
  const time = Date.parse(text(value, 120));
  if (!Number.isFinite(time)) return null;
  return Number(((Date.now() - time) / 86400000).toFixed(2));
}
function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function safeGates(value) {
  const source = object(value);
  return Object.fromEntries(
    Object.entries(source)
      .slice(0, 24)
      .map(([key, candidate]) => [text(key, 120), candidate === true]),
  );
}
function projectedComparison(value = {}) {
  const source = object(value);
  const reference = object(source.reference);
  const lossCaseIds = list(source.cases)
    .filter((item) => text(item?.outcome, 40) === "LOSS")
    .map((item) => text(item?.case_id, 160))
    .filter(Boolean)
    .slice(0, 80);
  return {
    reference: {
      provider: text(reference.provider, 120) || "unknown",
      model: text(reference.model, 200) || "unknown",
    },
    measured_at: text(source.measured_at, 120) || null,
    case_count: Number(source.case_count || 0),
    wins: Number(source.wins || 0),
    losses: Number(source.losses || 0),
    ties: Number(source.ties || 0),
    win_rate: finite(source.win_rate),
    owned_pass_rate: finite(source.owned_pass_rate),
    reference_pass_rate: finite(source.reference_pass_rate),
    p95_latency_ratio: finite(source.p95_latency_ratio),
    cost_ratio: finite(source.cost_ratio),
    reference_age_days: finite(source.reference_age_days),
    gates: safeGates(source.gates),
    passed: source.passed === true,
    loss_case_ids: lossCaseIds,
  };
}
function projectedBacklog(value = {}) {
  if (text(value?.contract, 180) !== CODE_AI_COMPETITIVE_IMPROVEMENT_BACKLOG_CONTRACT) {
    return [];
  }
  return list(value.items).slice(0, 40).map((item) => ({
    case_id: text(item?.case_id, 160) || null,
    category: text(item?.category, 160) || null,
    title: text(item?.title, 600) || null,
    required_evidence: list(item?.required_evidence)
      .map((entry) => text(entry, 600))
      .filter(Boolean)
      .slice(0, 12),
    losses: Number(item?.losses || 0),
    references: list(item?.references)
      .map((entry) => text(entry, 240))
      .filter(Boolean)
      .slice(0, 12),
  })).filter((item) => item.case_id);
}
export function projectCodeAICompetitiveBenchmarkEvidence({ report, backlog = null } = {}) {
  const source = object(report);
  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT_INVALID");
  }
  const comparisons = list(source.comparisons).map(projectedComparison).slice(0, 12);
  const ageDays = reportAgeDays(source.generated_at);
  const certified =
    source.competitive_certified === true &&
    source.superiority_claim_allowed === true &&
    comparisons.length >= 2 &&
    comparisons.every((item) => item.passed === true);
  const evidenceCurrent =
    ageDays !== null &&
    ageDays >= 0 &&
    ageDays <= MAX_REPORT_AGE_DAYS &&
    comparisons.every((item) => item.gates.reference_fresh === true);
  const projected = {
    contract: CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
    source_report_contract: CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT,
    generated_at: text(source.generated_at, 120) || null,
    report_age_days: ageDays,
    maximum_report_age_days: MAX_REPORT_AGE_DAYS,
    evidence_current: evidenceCurrent,
    competitive_certified: certified,
    superiority_claim_allowed: certified && evidenceCurrent,
    suite_contract: text(source.suite_contract, 180) || null,
    suite_case_count: Number(source.suite_case_count || 0),
    comparisons,
    improvement_backlog: projectedBacklog(backlog || {}),
    runtime_provider_effect: "NONE",
    external_reference_execution_performed_by_persistence: false,
    source_repository_commit_provenance: "UNBOUND_SOURCE_REPORT",
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_included: false,
    automatic_source_mutation_authority: false,
    commit_authority: false,
    production_deploy_authority: false,
    provider_routing_authority: false,
    model_promotion_authority: false,
    authorization_effect: "NONE",
  };
  return { ...projected, evidence_fingerprint: fingerprint(projected) };
}

async function learningOrganizationId() {
  const resolved = await resolveAvantiqoLearningOrganization();
  if (!resolved?.organization_id) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  }
  return resolved.organization_id;
}

export async function persistCodeAICompetitiveBenchmarkEvidence({
  report,
  backlog = null,
  storage_repository_commit = null,
} = {}) {
  const evidence = projectCodeAICompetitiveBenchmarkEvidence({ report, backlog });
  const organizationId = await learningOrganizationId();
  const memoryKey = `code_ai_competitive_benchmark_evidence:v1:${evidence.evidence_fingerprint.slice(0, 40)}`;
  const now = new Date().toISOString();
  const persisted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey,
      memory_type: "fact",
      subject: "Avantiqo Code Competitive Benchmark Evidence",
      content: evidence.competitive_certified
        ? `Competitive Code benchmark certified against ${evidence.comparisons.length} fresh reference systems.`
        : `Competitive Code benchmark not certified; ${evidence.improvement_backlog.length} evidence-backed improvement cases available.`,
      importance: 0.08,
      confidence: evidence.evidence_current ? 1 : 0.7,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        ...evidence,
        storage_repository_commit: /^[a-f0-9]{40}$/i.test(text(storage_repository_commit, 160))
          ? text(storage_repository_commit, 160).toLowerCase()
          : null,
        persisted_at: now,
        ordinary_memory_recall: false,
      },
      updated_at: now,
    }, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,updated_at")
    .maybeSingle();
  if (persisted.error) throw persisted.error;
  if (!persisted.data?.id) throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_PERSIST_FAILED");
  return {
    persisted: true,
    row_id: persisted.data.id,
    updated_at: persisted.data.updated_at || now,
    evidence,
    authorization_effect: "NONE",
  };
}

export async function loadLatestCodeAICompetitiveBenchmarkEvidence() {
  const organizationId = await learningOrganizationId();
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data?.id) return { found: false, evidence: null };
  const metadata = object(loaded.data.metadata);
  if (text(metadata.contract, 180) !== CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT_INVALID");
  }
  return {
    found: true,
    row_id: loaded.data.id,
    updated_at: loaded.data.updated_at || null,
    evidence: metadata,
    authorization_effect: "NONE",
  };
}

export const CodeAICompetitiveBenchmarkEvidenceRuntime = Object.freeze({
  contract: CODE_AI_COMPETITIVE_BENCHMARK_EVIDENCE_CONTRACT,
  report_contract: CODE_AI_COMPETITIVE_BENCHMARK_REPORT_CONTRACT,
  persist: persistCodeAICompetitiveBenchmarkEvidence,
  loadLatest: loadLatestCodeAICompetitiveBenchmarkEvidence,
  project: projectCodeAICompetitiveBenchmarkEvidence,
  provider_routing_authority: false,
  production_deploy_authority: false,
});

export default CodeAICompetitiveBenchmarkEvidenceRuntime;
