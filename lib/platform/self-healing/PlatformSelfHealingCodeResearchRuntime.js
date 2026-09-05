import { createHash, randomUUID } from "node:crypto";

import {
  runOperatorWebEvidenceResearch,
} from "@/lib/platform/research/runtime/OperatorWebEvidenceRuntime";
import {
  compareOperatorResearchEvidence,
} from "@/lib/platform/research/runtime/OperatorResearchEvidenceComparisonRuntime";

export const PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT =
  "AVANTIQO_PLATFORM_SELF_HEALING_CODE_RESEARCH_V1";
export const PLATFORM_SELF_HEALING_REPLAY_CONTRACT =
  "AVANTIQO_PLATFORM_SELF_HEALING_REPLAY_V1";

const PRIVATE_PATTERNS = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /https?:\/\/[^\s]+/gi,
  /\b(?:sk|pk|rk|api|token|secret|key)[-_][A-Za-z0-9_-]{12,}\b/gi,
];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function publicProblemText(value, limit = 600) {
  let result = text(value, limit);
  for (const pattern of PRIVATE_PATTERNS) result = result.replace(pattern, "[redacted]");
  return result
    .replace(/\b\d{8,}\b/g, "[id]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function combinedEvidence(payload = {}) {
  const evidence = object(payload.evidence);
  const expected = object(payload.expected_contract || payload.expectedContract);
  return [
    payload.problem_type,
    payload.category,
    payload.title,
    payload.error_class,
    payload.error_code,
    payload.error_message,
    payload.route,
    payload.action,
    payload.capability,
    payload.source,
    evidence.error_class,
    evidence.error_code,
    evidence.error_message,
    evidence.diagnosis,
    expected.capability,
    expected.action,
    expected.expected_outcome,
  ].map((item) => text(item, 800)).filter(Boolean).join(" ").toLowerCase();
}

function authoritativePreparedClassification(payload = {}) {
  const classification = text(payload.classification, 80).toUpperCase();
  const proof = object(object(payload.evidence).authoritative_registry_proof);

  if (
    classification === "AUTO_REPAIR" &&
    proof.authority_purpose === "repair" &&
    proof.registered_route === true &&
    proof.explicit_incomplete_status !== true
  ) {
    return {
      classification: "AUTO_REPAIR",
      reason: "The server-owned self-healing boundary independently resolved the failed surface to a canonical registered route before repair preparation.",
      research_required: true,
      code_execution_allowed: true,
      authority_source: "ERP_REGISTRY",
    };
  }

  if (
    classification === "AUTO_COMPLETE" &&
    proof.authority_purpose === "completion" &&
    proof.explicit_incomplete_status === true
  ) {
    return {
      classification: "AUTO_COMPLETE",
      reason: "The server-owned self-healing boundary independently proved that the canonical registered capability is explicitly incomplete.",
      research_required: true,
      code_execution_allowed: true,
      authority_source: "ERP_REGISTRY",
    };
  }

  return null;
}

export function classifyPlatformSelfHealingFailure(payload = {}) {
  const source = combinedEvidence(payload);
  const expected = object(payload.expected_contract || payload.expectedContract);
  const hasExpectedBehavior = Boolean(
    text(expected.capability) || text(expected.action) || text(expected.expected_outcome) ||
    text(payload.capability) || text(payload.action) || text(payload.route),
  );

  if (/api (?:is )?not (?:used|enabled)|credential|oauth|access token|quota|billing account|provider configuration|environment variable|missing secret/.test(source)) {
    return {
      classification: "NON_CODE_CONFIGURATION",
      reason: "Authoritative evidence indicates external/provider configuration rather than a product implementation defect.",
      research_required: false,
      code_execution_allowed: false,
    };
  }

  if (!hasExpectedBehavior && /undefined behavior|product decision|expected behavior unknown|no authoritative contract/.test(source)) {
    return {
      classification: "PRODUCT_DECISION_REQUIRED",
      reason: "The expected product behavior is not authoritative enough for Code to invent it safely.",
      research_required: true,
      code_execution_allowed: false,
    };
  }

  const governed = /payment|refund|ledger|journal|posting|tax|vat|authentication|authorization|permission|security|rls|row level|credential|pricing|production routing|deploy|migration|drop table|delete data|destructive/.test(source);
  if (governed) {
    return {
      classification: "GOVERNED_CHANGE",
      reason: "The repair touches a high-impact governed boundary and may be engineered automatically but cannot self-promote.",
      research_required: true,
      code_execution_allowed: true,
    };
  }

  const incomplete = /not implemented|missing route|route missing|page missing|workspace missing|capability missing|unfinished|incomplete|404|not found|path.*missing|path.*not done/.test(source);
  if (incomplete) {
    return {
      classification: "AUTO_COMPLETE",
      reason: "The expected capability is defined but its implementation appears incomplete or absent.",
      research_required: true,
      code_execution_allowed: true,
    };
  }

  return {
    classification: "AUTO_REPAIR",
    reason: /organization[_ ]?id.*(?:missing|required)|missing.*organization[_ ]?id|consumer.*not claim|context.*missing/.test(source)
      ? "The evidence points to a bounded implementation/runtime defect with authoritative expected behavior."
      : "The failure is code-eligible and should be reproduced, repaired and replay-verified before it is considered fixed.",
    research_required: true,
    code_execution_allowed: true,
  };
}

function genericProblemClass(payload = {}, classification) {
  const source = combinedEvidence(payload);
  if (/organization[_ ]?id|organization context|business context/.test(source)) {
    return "reliable organization-scoped context propagation and fail-closed recovery in multi-organization ERP/SaaS applications";
  }
  if (/consumer.*not claim|event backlog|event processing|queue/.test(source)) {
    return "durable event delivery, consumer claiming, retries, idempotency and operator recovery in business workflow systems";
  }
  if (/route|404|page|workspace|navigation/.test(source)) {
    return "resilient capability routing, incomplete-feature handling and progressive product completion in enterprise applications";
  }
  if (/payment|refund/.test(source)) {
    return "governed payment and refund workflow recovery with immutable accounting evidence";
  }
  if (/ledger|journal|posting|tax|vat/.test(source)) {
    return "governed accounting workflow repair with auditability, simulation and source-evidence controls";
  }
  if (/auth|permission|security|rls/.test(source)) {
    return "secure authorization and scoped access failure recovery in enterprise multi-organization software";
  }
  if (classification === "AUTO_COMPLETE") {
    return "safe completion of registered but unfinished enterprise software capabilities with strong human workflow design";
  }
  return "self-healing enterprise software that diagnoses product failures, repairs code, verifies outcomes and preserves governance";
}

function researchQuestion(payload, classification) {
  const problemClass = genericProblemClass(payload, classification);
  return publicProblemText([
    `Research the strongest current systems and mechanisms for ${problemClass}.`,
    "Compare at least three mature products, platforms, or engineering approaches where evidence exists.",
    "Identify what each does well, known workflow or reliability weaknesses, and the mechanisms behind the strongest behavior.",
    "Focus on human workflow, context propagation, observability, recovery, auditability, security boundaries, verification, latency and failure modes.",
    "Derive an approach that can be materially better rather than copying an existing product.",
    "Do not search for or transmit private organization names, customer data, UUIDs, request payloads, credentials, source code, proprietary identifiers or secrets.",
  ].join(" "), 1800);
}

function compactSources(sources = []) {
  return list(sources).slice(0, 10).map((source, index) => ({
    id: text(source?.id, 120) || `source-${index + 1}`,
    url: text(source?.url, 1800) || null,
    title: text(source?.title, 360) || null,
    publisher: text(source?.publisher, 240) || null,
    published_at: text(source?.published_at, 120) || null,
    source_type: text(source?.source_type, 120) || null,
    official: source?.official === true,
    primary: source?.primary === true,
    excerpt: text(source?.excerpt, 700) || null,
  }));
}

function replayContract(payload = {}) {
  const expected = object(payload.expected_contract || payload.expectedContract);
  return {
    contract: PLATFORM_SELF_HEALING_REPLAY_CONTRACT,
    required: true,
    original_action: text(payload.action || expected.action, 300) || null,
    original_route: text(payload.route || expected.route, 1000) || null,
    capability: text(payload.capability || expected.capability, 300) || null,
    expected_outcome: text(expected.expected_outcome, 1000) || null,
    failure_signature: text(payload.error_class || payload.error_code || object(payload.evidence).error_class, 300) || null,
    exact_replay_preferred: true,
    fixed_requires_original_failure_absent: true,
    fixed_requires_expected_outcome_observed: true,
    unsafe_replay_requires_verification_status: "verification_required",
  };
}

function missionId(payload = {}) {
  const explicit = text(payload.failure_id || payload.failureId || payload.signal_key || payload.signalKey, 240);
  if (explicit) {
    const digest = createHash("sha256").update(explicit).digest("hex").slice(0, 24);
    return `self-heal:${digest}`;
  }
  return `self-heal:${randomUUID()}`;
}

function buildEngineeringObjective({ payload, classification, comparison, replay }) {
  const expected = object(payload.expected_contract || payload.expectedContract);
  const problem = text(payload.title || payload.error_message || payload.problem_type, 700) || "the captured product failure";
  const comparisonConclusion = text(comparison?.analysis?.conclusion, 900);
  const expectedOutcome = text(expected.expected_outcome, 700);
  const lines = [
    `Platform self-healing mission (${classification}).`,
    `Reproduce and diagnose: ${problem}.`,
    expectedOutcome ? `Authoritative expected outcome: ${expectedOutcome}.` : null,
    "Inspect current repository HEAD and authoritative Avantiqo capability/context contracts before changing code.",
    comparisonConclusion ? `Fresh market research reconciliation: ${comparisonConclusion}.` : "Use the attached fresh research evidence and comparison as advisory engineering context.",
    "Do not copy external implementation code. Use mechanisms and tradeoffs as evidence, then build the strongest Avantiqo-native solution.",
    "Preserve organization/entity/party scope, security, accounting and existing governance boundaries.",
    "Add or update regression coverage for the failure and adjacent high-risk behavior.",
    replay.original_action || replay.original_route
      ? "After repair, replay the captured original action/path and prove the expected outcome. Do not call the issue fixed if replay cannot be proven."
      : "After repair, construct the closest safe deterministic reproducer and require fresh verification evidence.",
    classification === "GOVERNED_CHANGE"
      ? "Prepare and verify the change, but do not grant yourself commit, migration, production routing or deployment authority."
      : "Do not grant yourself commit or deployment authority; return a verified engineering artifact for governed promotion.",
  ].filter(Boolean);
  return text(lines.join("\n"), 3900);
}

export async function preparePlatformSelfHealingCodeMission({
  context = {},
  payload = {},
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) throw new Error("PLATFORM_SELF_HEALING_ORGANIZATION_REQUIRED");

  const classification = authoritativePreparedClassification(payload) || classifyPlatformSelfHealingFailure(payload);
  const replay = replayContract(payload);
  const base = {
    contract: PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
    ...classification,
    replay,
    promotion: {
      commit_authority: false,
      deploy_authority: false,
      migration_authority: false,
      production_routing_authority: false,
      automatic_promotion: false,
    },
    privacy: {
      research_query_contains_private_customer_data: false,
      raw_request_payload_sent_to_research: false,
      source_code_sent_to_research: false,
      credentials_sent_to_research: false,
    },
  };

  if (!classification.code_execution_allowed) {
    return {
      ...base,
      status: classification.classification === "NON_CODE_CONFIGURATION"
        ? "CONFIGURATION_ACTION_REQUIRED"
        : "PRODUCT_DECISION_REQUIRED",
      objective: null,
      research: null,
      comparison: null,
      intelligence_mission_preparation: null,
    };
  }

  const query = researchQuestion(payload, classification.classification);
  const research = await runOperatorWebEvidenceResearch({
    context,
    payload: {
      query,
      objective: "Collect current comparative evidence that helps Avantiqo repair or complete this product behavior better than existing systems without copying them.",
      minimum_sources: 4,
      max_sources: 10,
      freshness_days: 730,
      search_context_size: "high",
    },
  });

  const sources = compactSources(research.sources);
  if (sources.length < 4) {
    throw new Error(`PLATFORM_SELF_HEALING_RESEARCH_INSUFFICIENT:${sources.length}:4`);
  }

  const comparison = await compareOperatorResearchEvidence({
    context,
    payload: {
      question: query,
      sources,
      research_contract: research.contract,
      domain: "intelligence",
    },
  });

  const replayPlan = replayContract(payload);
  const objective = buildEngineeringObjective({
    payload,
    classification: classification.classification,
    comparison,
    replay: replayPlan,
  });
  const id = missionId(payload);

  return {
    ...base,
    status: "RESEARCHED_CODE_MISSION_READY",
    objective,
    research: {
      contract: research.contract,
      status: research.status,
      query,
      source_count: sources.length,
      sources,
      provider: research?.evidence?.provider || null,
      web_search_observed: research?.evidence?.web_search_observed === true,
      external_evidence_untrusted: true,
    },
    comparison: {
      contract: comparison.contract,
      status: comparison.status,
      source_count: comparison.source_count,
      analysis: object(comparison.analysis),
      owned_intelligence: comparison?.reasoning?.owned_intelligence === true,
    },
    intelligence_mission_preparation: {
      mission_id: id,
      complexity_class: "large",
      business_intent: "Repair or complete the captured Avantiqo product behavior using authoritative product intent, fresh comparative research and exact replay verification.",
      canonical_context: {
        self_healing_contract: PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
        classification: classification.classification,
        classification_reason: classification.reason,
        classification_authority_source: classification.authority_source || null,
        expected_contract: object(payload.expected_contract || payload.expectedContract),
        local_failure_evidence: {
          category: text(payload.category, 160) || null,
          source: text(payload.source, 160) || null,
          error_class: text(payload.error_class || object(payload.evidence).error_class, 300) || null,
          error_code: text(payload.error_code || object(payload.evidence).error_code, 300) || null,
          diagnosis: text(object(payload.evidence).diagnosis, 500) || null,
        },
        external_research: {
          query,
          sources,
          comparison: object(comparison.analysis),
          external_evidence_untrusted: true,
          authorization_effect: "NONE",
        },
        replay_contract: replayPlan,
        promotion_authority: "NONE",
      },
      knowledge_options: {
        research_evidence_is_advisory: true,
        external_evidence_never_authorizes_actions: true,
        automatic_knowledge_promotion: false,
      },
    },
  };
}

export const PlatformSelfHealingCodeResearchRuntime = Object.freeze({
  contract: PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
  classify: classifyPlatformSelfHealingFailure,
  prepare: preparePlatformSelfHealingCodeMission,
});

export default preparePlatformSelfHealingCodeMission;