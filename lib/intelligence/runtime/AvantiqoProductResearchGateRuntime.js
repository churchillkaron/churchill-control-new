import {
  runAvantiqoKnowledgeAwareResearch,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime";
import {
  runOperatorMechanismResearch,
} from "@/lib/platform/research/runtime/OperatorMechanismResearchRuntime";

export const AVANTIQO_PRODUCT_RESEARCH_GATE_CONTRACT =
  "AVANTIQO_PRODUCT_RESEARCH_GATE_V1";

const REPOSITORY_ONLY = "repository_only";
const FAST_EVIDENCE = "fast_evidence";
const DEEP_MECHANISM = "deep_mechanism";

const LOCAL_REPAIR_PATTERN =
  /\b(bug|broken|error|exception|lint|import|typo|css|spacing|button|mobile|responsive|scroll|layout|dropdown|not working|fails?|failure|fix|repair)\b/i;
const PRODUCT_WORKFLOW_PATTERN =
  /\b(accounting|finance|invoice|quotation|procurement|inventory|hotel|restaurant|retail|construction|agency|hr|people|payroll|onboarding|workflow|workspace|operations|commercial|supply chain|customer|supplier|project|compliance|audit|tax|vat|pos|kiosk|portal)\b/i;
const DEEP_PRODUCT_PATTERN =
  /\b(world[- ]class|best in (?:the )?market|better than|market leader|competitive|competitor|benchmark|new architecture|architecture redesign|new system|new domain|fundamental|future[- ]proof|industry[- ]leading|professional standard|accounting standard|regulation|regulated|compliance architecture)\b/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function compactResearch(result = {}) {
  return {
    contract: text(result.contract, 180) || null,
    status: text(result.status, 120) || null,
    research_mode: text(result.research_mode, 80) || null,
    answer: text(result.answer, 9000),
    claims: list(result.claims).slice(0, 16),
    sources: list(result.sources).slice(0, 8).map((source) => ({
      id: text(source?.id, 160) || null,
      url: text(source?.url, 2000) || null,
      title: text(source?.title, 500) || null,
      publisher: text(source?.publisher, 300) || null,
      source_type: text(source?.source_type || source?.sourceType, 120) || null,
      official: source?.official === true,
      primary: source?.primary === true,
    })),
    uncertainty: list(result.uncertainty).slice(0, 12),
    mechanism_quality: result.mechanism_quality || null,
    mechanism_synthesis: result.mechanism_synthesis || null,
  };
}

export function classifyAvantiqoProductResearchDepth({ focus } = {}) {
  const source = text(focus, 4000);
  if (!source) return FAST_EVIDENCE;
  if (DEEP_PRODUCT_PATTERN.test(source)) return DEEP_MECHANISM;
  if (PRODUCT_WORKFLOW_PATTERN.test(source)) return FAST_EVIDENCE;
  if (LOCAL_REPAIR_PATTERN.test(source)) return REPOSITORY_ONLY;
  return FAST_EVIDENCE;
}

function researchQuestion(focus, depth) {
  const objective = text(focus, 2200) ||
    "Continue improving Avantiqo from the strongest evidence-backed product opportunity.";
  const depthInstruction = depth === DEEP_MECHANISM
    ? "Explain the mechanisms, professional workflows, standards, leading product patterns, tradeoffs and opportunities to materially outperform current market approaches."
    : "Identify the most relevant current professional workflows, authoritative standards, leading product practices and user expectations that should influence the product decision.";
  return [
    `Research evidence for this Avantiqo product objective: ${objective}`,
    depthInstruction,
    "Prefer authoritative standards, primary documentation and strong professional sources; use leading products as comparative evidence, not templates to copy.",
    "Focus on requirements, failure modes, workflow quality, automation opportunities and measurable product advantages that can be translated into Avantiqo's neutral PLATFORM -> USER -> BUSINESS CONTEXT -> UBTE -> ERP_REGISTRY -> DOMAIN -> WORKSPACE -> CAPABILITY -> DOCUMENT architecture.",
  ].join("\n");
}

export async function collectAvantiqoProductDecisionResearch({
  context = {},
  focus = null,
} = {}) {
  const depth = classifyAvantiqoProductResearchDepth({ focus });
  if (depth === REPOSITORY_ONLY) {
    return {
      contract: AVANTIQO_PRODUCT_RESEARCH_GATE_CONTRACT,
      status: "REPOSITORY_EVIDENCE_SUFFICIENT_FOR_LOCAL_REPAIR",
      depth,
      research_performed: false,
      latency_policy: "NO_EXTERNAL_RESEARCH_FOR_BOUNDED_LOCAL_REPAIR",
      authorization_effect: "NONE",
    };
  }

  const query = researchQuestion(focus, depth);
  try {
    const result = depth === DEEP_MECHANISM
      ? await runOperatorMechanismResearch({
          context,
          payload: {
            query,
            objective: text(focus, 2000) || "Select the strongest Avantiqo product improvement.",
            research_mode: "mechanism",
            minimum_sources: 3,
            max_sources: 6,
            search_context_size: "medium",
            freshness_days: 180,
          },
        })
      : await runAvantiqoKnowledgeAwareResearch({
          context,
          payload: {
            query,
            objective: text(focus, 2000) || "Select the strongest Avantiqo product improvement.",
            minimum_sources: 2,
            max_sources: 4,
            search_context_size: "low",
            freshness_days: 180,
          },
        });

    return {
      contract: AVANTIQO_PRODUCT_RESEARCH_GATE_CONTRACT,
      status: "RESEARCH_EVIDENCE_AVAILABLE",
      depth,
      research_performed: true,
      latency_policy: depth === DEEP_MECHANISM
        ? "DEEP_ONLY_FOR_HIGH_IMPACT_PRODUCT_OR_ARCHITECTURE_DECISIONS"
        : "BOUNDED_FAST_EVIDENCE_FIRST",
      evidence: compactResearch(result),
      external_evidence_untrusted: true,
      implementation_reference_is_evidence_not_answer: true,
      authorization_effect: "NONE",
    };
  } catch (error) {
    return {
      contract: AVANTIQO_PRODUCT_RESEARCH_GATE_CONTRACT,
      status: "RESEARCH_UNAVAILABLE_CONTINUE_WITH_EXPLICIT_LIMIT",
      depth,
      research_performed: false,
      error: text(error?.message || error, 500) || "PRODUCT_RESEARCH_FAILED",
      external_research_failure_does_not_create_authority: true,
      authorization_effect: "NONE",
    };
  }
}

export const AvantiqoProductResearchGateRuntime = Object.freeze({
  contract: AVANTIQO_PRODUCT_RESEARCH_GATE_CONTRACT,
  classify: classifyAvantiqoProductResearchDepth,
  collect: collectAvantiqoProductDecisionResearch,
  depths: Object.freeze({
    REPOSITORY_ONLY,
    FAST_EVIDENCE,
    DEEP_MECHANISM,
  }),
});

export default collectAvantiqoProductDecisionResearch;
