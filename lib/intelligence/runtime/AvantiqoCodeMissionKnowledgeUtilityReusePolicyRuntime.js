import {
  AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
  deriveAvantiqoKnowledgeUseReceipt,
  summarizeAvantiqoKnowledgeUtilityAttribution,
} from "./AvantiqoKnowledgeUtilityAttributionRuntime.js";

export const AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT =
  "AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_V1";

const CODE_CAPABILITY_KEY = "platform.code_ai_autonomous.execute";
const REUSED_STATUS = "REUSED_VERIFIED_KNOWLEDGE";
const NO_RELEVANT_STATUS = "NO_RELEVANT_VERIFIED_KNOWLEDGE";
const HYBRID_VERIFICATION = "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE";
const CANONICAL_VERIFICATION = "AVANTIQO_CANONICAL_PRODUCT";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unchangedKnowledge(value) {
  return object(value);
}

function hybridKnowledgePattern(learnedKnowledge = {}) {
  const learned = object(learnedKnowledge);
  const knowledge = list(learned.knowledge).map(object).slice(0, 20);
  if (text(learned.status, 120) !== REUSED_STATUS || !knowledge.length) {
    return {
      applicable: false,
      status: "NOT_APPLICABLE_NO_REUSED_KNOWLEDGE",
      receipt_fingerprint: null,
      knowledge_count: knowledge.length,
    };
  }

  const verificationStates = knowledge.map((item) =>
    text(item.verification_status || item.release_status || item.epistemic_state, 160).toUpperCase()
  );
  if (verificationStates.some((state) => state === CANONICAL_VERIFICATION)) {
    return {
      applicable: false,
      status: "NOT_APPLICABLE_CANONICAL_PRODUCT_AUTHORITY",
      receipt_fingerprint: null,
      knowledge_count: knowledge.length,
    };
  }
  if (!verificationStates.every((state) => state === HYBRID_VERIFICATION)) {
    return {
      applicable: false,
      status: "NOT_APPLICABLE_NON_HYBRID_KNOWLEDGE",
      receipt_fingerprint: null,
      knowledge_count: knowledge.length,
    };
  }

  const receipt = deriveAvantiqoKnowledgeUseReceipt({
    decision: {
      knowledge_reuse: {
        reused: true,
        reason: "VERIFIED_CODE_MISSION_REUSED_SHARED_KNOWLEDGE",
        knowledge,
      },
      evidence_graph: {
        checked: learned.evidence_graph_checked === true,
        block_knowledge_reuse: false,
      },
    },
    execution: {
      status: "completed",
      capability: {
        key: CODE_CAPABILITY_KEY,
        mode: "write",
      },
      post_action_verification: {
        status: "completed",
        verification_source: "CODE_EMPLOYEE_STRUCTURAL_COMPLETION",
      },
    },
  });
  if (!receipt?.receipt_fingerprint) {
    return {
      applicable: false,
      status: "NOT_APPLICABLE_NO_STABLE_KNOWLEDGE_REFERENCE",
      receipt_fingerprint: null,
      knowledge_count: knowledge.length,
    };
  }

  return {
    applicable: true,
    status: "UTILITY_PATTERN_READY",
    receipt_fingerprint: receipt.receipt_fingerprint,
    knowledge_count: knowledge.length,
  };
}

export function buildAvantiqoCodeMissionKnowledgeUtilityPattern({
  learned_knowledge,
} = {}) {
  const pattern = hybridKnowledgePattern(learned_knowledge);
  return {
    contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
    capability_key: CODE_CAPABILITY_KEY,
    ...pattern,
    governance: {
      hybrid_released_knowledge_only: true,
      canonical_product_authority_affected: false,
      observational_association_only: true,
      causal_attribution_allowed: false,
      authorization_effect: "NONE",
    },
  };
}

export function assessAvantiqoCodeMissionKnowledgeUtilityReuse({
  learned_knowledge,
  utility_summary,
} = {}) {
  const learned = unchangedKnowledge(learned_knowledge);
  const pattern = buildAvantiqoCodeMissionKnowledgeUtilityPattern({
    learned_knowledge: learned,
  });
  if (!pattern.applicable) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
      status: pattern.status,
      applicable: false,
      evaluated: false,
      block_reuse: false,
      matched_signal: null,
      receipt_fingerprint: pattern.receipt_fingerprint,
      learned_knowledge: learned,
      governance: pattern.governance,
    };
  }

  const summary = object(utility_summary);
  if (summary.available !== true) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
      status: "UTILITY_SUMMARY_UNAVAILABLE_ALLOW_RELEASED_KNOWLEDGE",
      applicable: true,
      evaluated: false,
      block_reuse: false,
      matched_signal: null,
      receipt_fingerprint: pattern.receipt_fingerprint,
      learned_knowledge: learned,
      governance: {
        ...pattern.governance,
        utility_read_failure_can_block_reuse: false,
      },
    };
  }

  const matches = list(summary.summaries)
    .map(object)
    .filter((item) =>
      text(item.capability_key, 300) === CODE_CAPABILITY_KEY &&
      text(item.receipt_fingerprint, 120) === pattern.receipt_fingerprint
    );
  const eligibleMatches = matches.filter((item) => item.signal_eligible === true);
  const negative = eligibleMatches.find((item) => text(item.signal, 120) === "NEGATIVE_ASSOCIATION");
  const positive = eligibleMatches.find((item) => text(item.signal, 120) === "POSITIVE_ASSOCIATION");
  const mixed = eligibleMatches.find((item) => text(item.signal, 120) === "MIXED_ASSOCIATION");
  const matched = negative || positive || mixed || matches[0] || null;
  const blockReuse = Boolean(negative);
  const governedKnowledge = blockReuse
    ? {
        ...learned,
        status: NO_RELEVANT_STATUS,
        knowledge: [],
        stale_knowledge_reused: false,
        knowledge_authorizes_execution: false,
      }
    : learned;

  let status = "UTILITY_SIGNAL_INSUFFICIENT_ALLOW_RELEASED_KNOWLEDGE";
  if (!matches.length) status = "NO_MATCHING_UTILITY_PATTERN_ALLOW_RELEASED_KNOWLEDGE";
  if (positive) status = "MATURE_POSITIVE_ASSOCIATION_OBSERVED_ALLOW_RELEASED_KNOWLEDGE";
  if (mixed) status = "MATURE_MIXED_ASSOCIATION_OBSERVED_ALLOW_RELEASED_KNOWLEDGE";
  if (negative) status = "MATURE_NEGATIVE_ASSOCIATION_SUPPRESSED_REUSE";

  return {
    success: true,
    contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
    status,
    applicable: true,
    evaluated: true,
    block_reuse: blockReuse,
    matched_signal: matched ? text(matched.signal, 120) || null : null,
    receipt_fingerprint: pattern.receipt_fingerprint,
    matched_observations: matched ? Number(matched.total_observations || 0) : 0,
    matched_distinct_days: matched ? Number(matched.distinct_observation_days || 0) : 0,
    learned_knowledge: governedKnowledge,
    governance: {
      ...pattern.governance,
      utility_contract: text(summary.contract, 180) ||
        AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_CONTRACT,
      exact_receipt_pattern_required: true,
      mature_signal_required_to_change_reuse: true,
      single_observation_changes_reuse: false,
      insufficient_observations_change_reuse: false,
      positive_association_grants_authority: false,
      mixed_association_grants_authority: false,
      negative_association_is_advisory_safety_suppression_only: true,
      utility_read_failure_can_block_reuse: false,
      canonical_product_authority_affected: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
    },
  };
}

export async function evaluateAvantiqoCodeMissionKnowledgeUtilityReuse({
  learned_knowledge,
  database = null,
  summarize_utility = null,
} = {}) {
  const learned = unchangedKnowledge(learned_knowledge);
  const pattern = buildAvantiqoCodeMissionKnowledgeUtilityPattern({
    learned_knowledge: learned,
  });
  if (!pattern.applicable) {
    return assessAvantiqoCodeMissionKnowledgeUtilityReuse({
      learned_knowledge: learned,
      utility_summary: { available: false },
    });
  }

  const summarize = typeof summarize_utility === "function"
    ? summarize_utility
    : summarizeAvantiqoKnowledgeUtilityAttribution;
  let utilitySummary = null;
  try {
    utilitySummary = await summarize({ database });
  } catch (error) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
      status: "UTILITY_SUMMARY_READ_FAILED_ALLOW_RELEASED_KNOWLEDGE",
      applicable: true,
      evaluated: false,
      block_reuse: false,
      matched_signal: null,
      receipt_fingerprint: pattern.receipt_fingerprint,
      failure_reason: text(error?.message || error, 500),
      learned_knowledge: learned,
      governance: {
        ...pattern.governance,
        utility_read_failure_can_block_reuse: false,
        released_knowledge_governance_remains_authoritative: true,
        automatic_knowledge_promotion: false,
        automatic_training_effect: "NONE",
      },
    };
  }

  return assessAvantiqoCodeMissionKnowledgeUtilityReuse({
    learned_knowledge: learned,
    utility_summary: utilitySummary,
  });
}

export const AvantiqoCodeMissionKnowledgeUtilityReusePolicyRuntime = Object.freeze({
  contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_REUSE_POLICY_CONTRACT,
  capability_key: CODE_CAPABILITY_KEY,
  buildPattern: buildAvantiqoCodeMissionKnowledgeUtilityPattern,
  assess: assessAvantiqoCodeMissionKnowledgeUtilityReuse,
  evaluate: evaluateAvantiqoCodeMissionKnowledgeUtilityReuse,
});

export default AvantiqoCodeMissionKnowledgeUtilityReusePolicyRuntime;
