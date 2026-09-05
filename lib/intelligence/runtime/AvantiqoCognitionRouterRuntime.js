export const AVANTIQO_COGNITION_ROUTER_CONTRACT =
  "AVANTIQO_COGNITION_ROUTER_V1";

const FAST = "fast";
const DEEP = "deep";
const AUTO = "auto";
const MAX_REASONS = 16;

const DEEP_PATTERNS = Object.freeze([
  ["MULTI_STEP_PLANNING", /\b(plan|strategy|roadmap|architecture|design|diagnose|debug|investigate|root cause|tradeoff|trade-off|compare|evaluate|decide|recommend|optimi[sz]e|forecast|scenario|what should|how should)\b/i, 0.22],
  ["CAUSAL_REASONING", /\b(why|cause|caused|because|therefore|explain|reason|implication|consequence|risk|failure mode)\b/i, 0.14],
  ["CURRENT_EXTERNAL_EVIDENCE", /\b(latest|current|currently|today|recent|newest|price|pricing|rate|law|legal|regulation|standard|version|release|availability|market|competitor|news)\b/i, 0.18],
  ["HIGH_STAKES_DOMAIN", /\b(legal|tax|finance|financial|accounting|security|privacy|compliance|production|permission|authorization|payment|payroll|medical|safety)\b/i, 0.2],
  ["UNCERTAINTY_OR_CONFLICT", /\b(uncertain|conflict|contradict|ambiguous|unknown|verify|validate|prove|evidence|source|citation)\b/i, 0.16],
  ["LONG_HORIZON", /\b(long[- ]term|multi[- ]year|continuous|autonomous|self[- ]learning|24\/7|always|ongoing)\b/i, 0.12],
]);

const SPECIALIST_PATTERNS = Object.freeze([
  [
    "BUSINESS_DECISION_INTELLIGENCE",
    "business",
    /\b(revenue|gross margin|margin|ebitda|profit|profitability|cash ?flow|unit economics|pricing|forecast|budget|working capital|inventory|procurement|retention|churn|conversion|sales|pipeline|roi|payback|break[- ]even|capex|opex|allocation|headcount|capacity|demand)\b/i,
    /\b(should|decide|choose|compare|improve|increase|reduce|optimi[sz]e|forecast|model|plan|strategy|diagnose|explain|why|risk|scenario|target|allocate|prioriti[sz]e|tradeoff|trade-off|recommend)\b/i,
    0.46,
  ],
  [
    "AVANTIQO_SYSTEM_INTELLIGENCE",
    "avantiqo",
    /\b(avantiqo|churchill control|erp_registry|ubte|businesscontext|organization_id|service runtime|provider routing|safe lease|runpod|supabase|vercel)\b/i,
    /\b(fix|debug|implement|build|refactor|audit|review|optimi[sz]e|correct|repair|diagnose|test|prove|trace|profile|benchmark|design|architect|migrate|route|harden|certify|deploy|integrate)\b/i,
    0.48,
  ],
  [
    "CODE_SYSTEM_INTELLIGENCE",
    "code",
    /\b(code|codebase|repository|repo|typescript|javascript|next\.?js|node(?:\.js)?|sql|migration|schema|api|endpoint|runtime|worker|function|class|test|build|ci|compiler|stack trace|exception|bug|regression|refactor|implementation)\b/i,
    /\b(fix|debug|implement|build|refactor|audit|review|optimi[sz]e|correct|repair|diagnose|test|prove|trace|profile|benchmark|design|architect|migrate|harden|certify|deploy|integrate)\b/i,
    0.48,
  ],
]);

const SPECIALIST_FAST_PATH = /\b(typo|format(?:ting)?|rename|comment|whitespace|spelling|lint(?:ing)?|prettier)\b/i;

const FAST_PATTERNS = Object.freeze([
  ["BOUNDED_TRANSFORM", /\b(rewrite|rephrase|translate|format|extract|classify|label|shorten|summari[sz]e|spell|grammar|convert)\b/i, 0.18],
  ["DIRECT_FACT_FROM_CONTEXT", /\b(what is|which is|show me|list|give me|repeat|remind me)\b/i, 0.08],
]);

const CURRENT_PATTERNS = /\b(latest|current|currently|today|recent|newest|price|pricing|rate|law|legal|regulation|version|release|availability|news|weather|market|schedule)\b/i;
const MUTATION_PATTERNS = /\b(create|update|delete|remove|send|publish|deploy|commit|approve|pay|charge|refund|book|schedule|cancel|change|write|execute|run|apply|mutate)\b/i;
const IRREVERSIBLE_PATTERNS = /\b(delete|purge|destroy|terminate|publish|deploy production|production deploy|pay|charge|refund|send externally|revoke|drop table|truncate)\b/i;
const AMBIGUOUS_REFERENCE_PATTERNS = /\b(this|that|it|they|them|there|same one|as before|the previous|last one)\b/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bounded(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeRequestedMode(value) {
  const candidate = text(value, 40).toLowerCase();
  return [FAST, DEEP, AUTO].includes(candidate) ? candidate : AUTO;
}

function toolShape(tool) {
  const item = object(tool);
  const name = text(item.name || item.function?.name || item.capability_key, 240);
  const mode = text(
    item.operatorMode || item.mode || item.metadata?.operatorMode || item.metadata?.mode,
    40,
  ).toLowerCase();
  const risk = text(item.risk || item.metadata?.risk, 40).toLowerCase();
  const mutating =
    item.mutating === true ||
    item.mutates === true ||
    item.transactional === true ||
    mode === "write" ||
    /\b(create|update|delete|execute|send|publish|deploy|commit|approve|pay|charge|refund)\b/i.test(name);
  return { name, mode, risk, mutating };
}

function memorySignals(memories) {
  const rows = list(memories).slice(0, 24);
  return {
    count: rows.length,
    live_read_required: rows.some((item) => item?.requires_live_read === true),
    low_confidence_count: rows.filter((item) => bounded(item?.confidence, 1) < 0.7).length,
    stale_count: rows.filter((item) => ["stale", "expired", "unknown"].includes(text(item?.freshness, 40).toLowerCase())).length,
  };
}

function structuralComplexity(goal) {
  const source = text(goal, 12000);
  const words = source.split(/\s+/).filter(Boolean).length;
  const sentences = source.split(/[.!?]+/).filter((part) => part.trim()).length;
  const conjunctions = (source.match(/\b(and|then|but|however|also|while|unless|except|before|after|because|therefore)\b/gi) || []).length;
  const clauses = Math.min(1, conjunctions / 8);
  const length = Math.min(1, Math.max(0, (words - 35) / 220));
  const sentenceLoad = Math.min(1, Math.max(0, (sentences - 2) / 8));
  return {
    words,
    sentences,
    conjunctions,
    score: bounded(length * 0.45 + sentenceLoad * 0.25 + clauses * 0.3),
  };
}

function specialistSignals(goal, context) {
  const source = text(goal, 12000);
  const ctx = object(context);
  const matches = [];
  for (const [code, domain, subjectPattern, actionPattern, weight] of SPECIALIST_PATTERNS) {
    if (subjectPattern.test(source) && actionPattern.test(source)) {
      matches.push({ code, domain, weight });
    }
  }

  const explicitDomain = text(
    ctx.intelligence_domain || ctx.cognition_domain || ctx.workload_domain || ctx.domain,
    80,
  ).toLowerCase();
  const contextDomain =
    explicitDomain === "software" || explicitDomain === "engineering"
      ? "code"
      : explicitDomain;
  if (["business", "avantiqo", "code"].includes(contextDomain) && !matches.some((item) => item.domain === contextDomain)) {
    matches.push({
      code: `SPECIALIST_CONTEXT_${contextDomain.toUpperCase()}`,
      domain: contextDomain,
      weight: 0.16,
    });
  }

  const trivialFastPath = SPECIALIST_FAST_PATH.test(source);
  const hardSpecialistMatch = matches.some((item) => item.weight >= 0.4);
  const contextualMultiStepDepth =
    ctx.multi_step_execution === true &&
    matches.some((item) => item.code.startsWith("SPECIALIST_CONTEXT_"));
  const depthRequired = Boolean(
    !trivialFastPath &&
    (hardSpecialistMatch || contextualMultiStepDepth)
  );

  return {
    matches,
    domains: [...new Set(matches.map((item) => item.domain))],
    trivial_fast_path: trivialFastPath,
    contextual_multi_step_depth: contextualMultiStepDepth,
    depth_required: depthRequired,
  };
}

function addReason(reasons, code, weight, detail = null) {
  reasons.push({ code, weight: Number(weight.toFixed(3)), detail });
}

export function routeAvantiqoCognition({
  goal,
  context = {},
  memories = [],
  tools = [],
  requested_mode = AUTO,
} = {}) {
  const goalText = text(goal, 12000);
  if (!goalText) throw new Error("AVANTIQO_COGNITION_ROUTER_GOAL_REQUIRED");

  const requested = normalizeRequestedMode(requested_mode);
  const ctx = object(context);
  const toolRows = list(tools).slice(0, 40).map(toolShape);
  const memory = memorySignals(memories);
  const structure = structuralComplexity(goalText);
  const specialist = specialistSignals(goalText, ctx);
  const reasons = [];
  let deepScore = 0.12 + structure.score * 0.22;
  let fastScore = 0.26;

  if (structure.score >= 0.45) addReason(reasons, "STRUCTURAL_COMPLEXITY", structure.score * 0.22, structure);

  for (const [code, pattern, weight] of DEEP_PATTERNS) {
    if (pattern.test(goalText)) {
      deepScore += weight;
      addReason(reasons, code, weight);
    }
  }
  for (const [code, pattern, weight] of FAST_PATTERNS) {
    if (pattern.test(goalText)) {
      fastScore += weight;
      addReason(reasons, code, -weight);
    }
  }
  for (const match of specialist.matches) {
    const appliedWeight = specialist.trivial_fast_path
      ? Math.min(0.08, match.weight)
      : match.weight;
    deepScore += appliedWeight;
    addReason(reasons, match.code, appliedWeight, {
      domain: match.domain,
      attenuated_for_trivial_fast_path: specialist.trivial_fast_path,
    });
  }
  if (specialist.contextual_multi_step_depth) {
    addReason(reasons, "SPECIALIST_CONTEXT_MULTI_STEP_DEPTH", 0.16, {
      domains: specialist.domains,
    });
  }
  if (specialist.trivial_fast_path) {
    fastScore += 0.16;
    addReason(reasons, "SPECIALIST_TRIVIAL_FAST_PATH", -0.16, { domains: specialist.domains });
  }

  const mutatingTools = toolRows.filter((tool) => tool.mutating);
  const highRiskTools = toolRows.filter((tool) => ["high", "critical"].includes(tool.risk));
  const toolBreadth = toolRows.length;
  if (toolBreadth >= 4) {
    const weight = Math.min(0.18, toolBreadth * 0.025);
    deepScore += weight;
    addReason(reasons, "MULTI_TOOL_COORDINATION", weight, { tool_count: toolBreadth });
  }
  if (mutatingTools.length) {
    deepScore += 0.2;
    addReason(reasons, "MUTATING_TOOL_AVAILABLE", 0.2, { count: mutatingTools.length });
  }
  if (highRiskTools.length) {
    deepScore += 0.22;
    addReason(reasons, "HIGH_RISK_TOOL_AVAILABLE", 0.22, { count: highRiskTools.length });
  }

  const currentEvidenceRequested = CURRENT_PATTERNS.test(goalText) || ctx.current_evidence_required === true;
  const mutationIntent = MUTATION_PATTERNS.test(goalText);
  const irreversibleIntent = IRREVERSIBLE_PATTERNS.test(goalText);
  const mutationCapabilityAvailable = mutatingTools.length > 0;
  const highRiskCapabilityAvailable = highRiskTools.length > 0;
  const ambiguousReference = AMBIGUOUS_REFERENCE_PATTERNS.test(goalText) && goalText.split(/\s+/).length < 24;

  if (memory.live_read_required) {
    deepScore += 0.16;
    addReason(reasons, "MEMORY_REQUIRES_LIVE_READ", 0.16);
  }
  if (memory.low_confidence_count >= 2) {
    deepScore += 0.1;
    addReason(reasons, "LOW_CONFIDENCE_MEMORY", 0.1, { count: memory.low_confidence_count });
  }
  if (ambiguousReference) {
    deepScore += 0.08;
    addReason(reasons, "AMBIGUOUS_REFERENCE", 0.08);
  }

  const explicitRisk = text(ctx.risk || ctx.risk_class, 40).toLowerCase();
  if (["high", "critical"].includes(explicitRisk)) {
    deepScore += 0.28;
    addReason(reasons, "CONTEXT_HIGH_RISK", 0.28, { risk: explicitRisk });
  } else if (explicitRisk === "medium") {
    deepScore += 0.1;
    addReason(reasons, "CONTEXT_MEDIUM_RISK", 0.1);
  }

  if (ctx.external_research_required === true || currentEvidenceRequested) {
    deepScore += 0.12;
    addReason(reasons, "RESEARCH_OR_FRESH_EVIDENCE_REQUIRED", 0.12);
  }
  if (ctx.conflicting_evidence === true) {
    deepScore += 0.24;
    addReason(reasons, "CONFLICTING_EVIDENCE", 0.24);
  }
  if (ctx.multi_step_execution === true) {
    deepScore += 0.16;
    addReason(reasons, "MULTI_STEP_EXECUTION", 0.16);
  }

  if (requested === FAST) fastScore += 0.18;
  if (requested === DEEP) deepScore += 0.18;

  deepScore = bounded(deepScore);
  fastScore = bounded(fastScore);

  const safetyFloorRequiresDeep = Boolean(
    irreversibleIntent ||
    highRiskCapabilityAvailable ||
    ctx.conflicting_evidence === true ||
    explicitRisk === "critical"
  );
  const specialistFloorRequiresDeep = specialist.depth_required;
  const anyDepthFloorRequiresDeep = safetyFloorRequiresDeep || specialistFloorRequiresDeep;

  let mode = deepScore >= 0.56 || anyDepthFloorRequiresDeep ? DEEP : FAST;
  if (requested === DEEP) mode = DEEP;
  if (requested === FAST && !anyDepthFloorRequiresDeep && deepScore < 0.72) mode = FAST;

  const margin = Math.abs(deepScore - fastScore);
  const routeConfidence = bounded(0.62 + margin * 0.34 + (anyDepthFloorRequiresDeep ? 0.12 : 0));
  const researchRequired = Boolean(ctx.external_research_required === true || currentEvidenceRequested);
  const liveReadRequired = Boolean(ctx.live_read_required === true || memory.live_read_required || currentEvidenceRequested);
  const verificationRequired = Boolean(
    mutationIntent ||
    irreversibleIntent ||
    ctx.verification_required === true
  );
  const critiqueRequired = Boolean(mode === DEEP || verificationRequired || researchRequired || ctx.conflicting_evidence === true);

  const escalation = {
    from_fast_to_deep_if: [
      "confidence_below_0_72",
      "tool_blocked_or_failed",
      "conflicting_evidence_detected",
      "required_live_evidence_missing",
      "mutation_or_irreversible_action_becomes_material",
      "specialist_business_avantiqo_or_code_depth_becomes_material",
      "completion_cannot_be_verified",
    ],
    never_downgrade_if: [
      "critical_risk",
      "irreversible_action",
      "unresolved_evidence_conflict",
      "specialist_depth_required",
    ],
  };

  return {
    contract: AVANTIQO_COGNITION_ROUTER_CONTRACT,
    requested_mode: requested,
    mode,
    execution_lane: mode,
    route_confidence: Number(routeConfidence.toFixed(4)),
    scores: {
      fast: Number(fastScore.toFixed(4)),
      deep: Number(deepScore.toFixed(4)),
      structural_complexity: Number(structure.score.toFixed(4)),
    },
    requirements: {
      research_required: researchRequired,
      live_read_required: liveReadRequired,
      verification_required: verificationRequired,
      critique_required: critiqueRequired,
      specialist_depth_required: specialistFloorRequiresDeep,
    },
    specialist: {
      domains: specialist.domains,
      depth_required: specialistFloorRequiresDeep,
      trivial_fast_path: specialist.trivial_fast_path,
      contextual_multi_step_depth: specialist.contextual_multi_step_depth,
    },
    signals: {
      current_evidence_requested: currentEvidenceRequested,
      mutation_intent: mutationIntent,
      irreversible_intent: irreversibleIntent,
      mutation_capability_available: mutationCapabilityAvailable,
      high_risk_capability_available: highRiskCapabilityAvailable,
      ambiguous_reference: ambiguousReference,
      tool_count: toolRows.length,
      mutating_tool_count: mutatingTools.length,
      high_risk_tool_count: highRiskTools.length,
      memory_count: memory.count,
      memory_live_read_required: memory.live_read_required,
      specialist_domains: specialist.domains,
    },
    reasons: reasons
      .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
      .slice(0, MAX_REASONS),
    escalation,
    governance: {
      deterministic_pre_model_routing: true,
      provider_selection_authority: false,
      memory_never_authorizes_writes: true,
      high_risk_safety_floor: true,
      specialist_depth_floor: true,
      specialist_trivial_fast_path: true,
      verification_tracks_intent_not_tool_availability: true,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoCognitionRouterRuntime = Object.freeze({
  contract: AVANTIQO_COGNITION_ROUTER_CONTRACT,
  route: routeAvantiqoCognition,
  modes: Object.freeze({ AUTO, FAST, DEEP }),
});