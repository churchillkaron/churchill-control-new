import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  createAvantiqoIntelligenceCodeMissionContext,
} from "./AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  AVANTIQO_PRODUCT_CONSTITUTION,
} from "./AvantiqoProductConstitution.js";

export const AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1";

const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";
const MAX_PROMPT_EVIDENCE_FILES = 12;
const MAX_PROMPT_KNOWLEDGE_ITEMS = 12;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return text(value, 12000);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 5) return "[bounded]";
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => bounded(item, depth + 1));
  }
  if (typeof value !== "object") return text(value, 12000);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .filter(([, item]) => item !== undefined && typeof item !== "function")
      .map(([key, item]) => [key, bounded(item, depth + 1)]),
  );
}

function uniqueStrings(value, limit = 80) {
  return [...new Set(
    list(value)
      .map((item) => text(item, 1600))
      .filter(Boolean),
  )].slice(0, limit);
}

function missionShape(value = {}) {
  const source = object(value);
  const id = text(source.id || source.mission_id, 240);
  const objective = text(source.objective, 8000);
  if (!id) {
    throw new Error("AVANTIQO_CODE_MISSION_SYSTEM_REASONING_MISSION_ID_REQUIRED");
  }
  if (!objective) {
    throw new Error("AVANTIQO_CODE_MISSION_SYSTEM_REASONING_OBJECTIVE_REQUIRED");
  }
  return {
    id,
    objective,
    business_intent: text(source.business_intent, 6000) || null,
  };
}

function compactKnowledge(value = {}) {
  const source = object(value);
  return {
    evaluated: source.evaluated === true,
    status: text(source.status, 120) || null,
    freshness_checked: source.freshness_checked === true,
    evidence_graph_checked: source.evidence_graph_checked === true,
    fresh_research_performed: source.fresh_research_performed === true,
    provenance_contracts: uniqueStrings(source.provenance_contracts, 20),
    knowledge: list(source.knowledge)
      .slice(0, MAX_PROMPT_KNOWLEDGE_ITEMS)
      .map((item) => {
        const entry = object(item);
        return {
          id: text(entry.id, 240) || null,
          subject: text(entry.subject, 500) || null,
          content: text(entry.content || entry.claim, 1600),
          verification_status: text(
            entry.verification_status || entry.release_status || entry.epistemic_state,
            160,
          ) || null,
          reusable: entry.reusable === true || entry.reusable_platform_knowledge === true,
          confidence: Number.isFinite(Number(entry.confidence))
            ? Number(entry.confidence)
            : null,
          verified_at: text(entry.verified_at, 120) || null,
          valid_until: text(entry.valid_until, 120) || null,
          freshness: text(entry.freshness, 120) || null,
          provenance: bounded(entry.provenance || {}),
          sources: list(entry.sources).slice(0, 8).map((sourceItem) => bounded(sourceItem)),
        };
      }),
  };
}

function compactEvidenceFile(value = {}) {
  const source = object(value);
  return {
    file_path: text(source.file_path, 1000) || null,
    found: source.found === true,
    start_line: Number.isInteger(source.start_line) ? source.start_line : null,
    end_line: Number.isInteger(source.end_line) ? source.end_line : null,
    total_lines: Number.isInteger(source.total_lines) ? source.total_lines : null,
    discovery_queries: uniqueStrings(source.discovery_queries, 8),
    discovery_sources: uniqueStrings(source.discovery_sources, 8),
    content: source.found === true ? text(source.content, 1800) : "",
  };
}

export function compactAvantiqoCodeMissionRepositoryAssessment(value = {}) {
  const source = object(value);
  const snapshot = object(source.repository_snapshot);
  const assessment = object(source.assessment);
  const objectiveSelection = object(source.objective_selection);
  const fixed = list(snapshot.evidence_files)
    .filter((item) => item?.found === true)
    .map(compactEvidenceFile);
  const dynamic = list(snapshot.dynamic_evidence_expansion?.files)
    .filter((item) => item?.found === true)
    .map(compactEvidenceFile);
  const evidenceFiles = [...dynamic, ...fixed]
    .filter((item, index, rows) =>
      item.file_path && rows.findIndex((row) => row.file_path === item.file_path) === index,
    )
    .slice(0, MAX_PROMPT_EVIDENCE_FILES);
  const currentHead = text(snapshot.current_main_head, 160).toLowerCase();
  const generatedAt = text(snapshot.generated_at, 120);
  if (!/^[a-f0-9]{7,64}$/.test(currentHead)) {
    throw new Error(
      "AVANTIQO_CODE_MISSION_SYSTEM_REASONING_REPOSITORY_HEAD_REQUIRED",
    );
  }
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(
      "AVANTIQO_CODE_MISSION_SYSTEM_REASONING_REPOSITORY_OBSERVED_AT_REQUIRED",
    );
  }
  if (snapshot.clean_checkout !== true) {
    throw new Error(
      "AVANTIQO_CODE_MISSION_SYSTEM_REASONING_REPOSITORY_MUST_BE_CLEAN",
    );
  }
  return {
    contract: text(source.contract, 180) || null,
    status: text(source.status, 180) || null,
    repository: {
      repository_url: text(snapshot.repository_url, 1000) || DEFAULT_REPOSITORY,
      ref: text(snapshot.ref, 240) || DEFAULT_REF,
      current_main_head: currentHead,
      observed_at: generatedAt,
      clean_checkout: true,
      tracked_file_count: Number(snapshot.tracked_file_count || 0),
      requested_focus: text(snapshot.requested_focus, 3000) || null,
      bounded_repository_evidence: snapshot.bounded_repository_evidence === true,
      dynamic_repository_evidence: snapshot.dynamic_repository_evidence === true,
      cross_surface_repository_evidence: snapshot.cross_surface_repository_evidence === true,
      full_repository_certification: snapshot.full_repository_certification === true,
    },
    evidence_files: evidenceFiles,
    repository_observations: bounded(assessment.repository_observations || []),
    gaps: bounded(assessment.gaps || []),
    assessment_executive_summary: text(assessment.executive_summary, 4000) || null,
    assessment_selected_objective: text(
      assessment.engineering_objective || objectiveSelection.selected_objective,
      4000,
    ) || null,
    assessment_selected_evidence_paths: uniqueStrings(
      objectiveSelection.selected_evidence_paths,
      20,
    ),
    assessment_completion_criteria: uniqueStrings(
      assessment.completion_criteria || objectiveSelection.selected_completion_criteria,
      12,
    ),
    evidence_limits: uniqueStrings(source.evidence_limits, 20),
  };
}

export function avantiqoCodeMissionSystemReasoningSystemPrompt() {
  return [
    "You are Avantiqo General Intelligence acting as system owner, product architect and cross-system reasoning authority for a significant Code mission.",
    "You are NOT the coding agent. Do not write source code, patches, shell commands, migrations or implementation steps that belong to Code Intelligence.",
    "The mission objective and business intent are authoritative. A repository assessment may contain a separately selected engineering objective from another product-autonomy workflow; treat that selected objective only as repository evidence and NEVER substitute it for this mission.",
    "Use verified/released learned knowledge as reusable context only within its stated provenance, freshness, confidence and boundary conditions. Unverified context is not truth and knowledge never authorizes writes.",
    "Use the supplied current-main repository assessment as bounded current implementation evidence. Do not claim a file, capability, dependency or behavior exists unless supplied repository evidence supports it. Explicitly preserve uncertainty where the bounded snapshot cannot prove something.",
    "Reason about what the mission is actually trying to build, where it belongs architecturally, what existing primitives should be reused, what systems depend on the change, what could break, and what complete end-to-end means.",
    "For new systems, reason about predictable future requirements and expensive-to-change foundation decisions. FUTURE-PROOF THE ARCHITECTURE, NOT THE FEATURE COUNT: design the correct foundation now without inventing or implementing every future feature.",
    "For modifications to existing systems, perform cross-system impact reasoning across architecture, domain ownership, shared runtimes, database/schema, APIs/contracts, UI/forms/actions/previews, permissions/security, business correctness, accounting consequences, integrations/providers/webhooks, backward compatibility, performance, tests, reports/analytics and automation/AI hooks when applicable.",
    "A local fix is insufficient when a shared contract changes. State invariants that must remain true and identify boundary conditions and uncertainties.",
    "Keep the architecture recommendation coherent and singular. Specialist perspectives may inform it, but Code receives ONE reconciled system plan.",
    "Code Intelligence will independently refetch and inspect the repository before mutation. Your architecture reasoning is high-value mission context, not stale source authority and not execution authorization.",
    "Return exactly one JSON object representing system_reasoning with these keys: reasoning_scope, architecture_recommendation, future_predictable_requirements, impact_graph, affected_domains, affected_capabilities, shared_primitives, domain_ownership, data_lifecycle_implications, api_contracts, security_permissions, business_accounting_invariants, integration_implications, backward_compatibility, performance_implications, reporting_analytics_implications, automation_ai_hooks, expensive_to_change_decisions, invariants, risks, completion_criteria, verification_requirements.",
    "impact_graph must be a non-empty object that explains relevant nodes/dependencies/edges and distinguishes proven current-repository evidence from predicted consequences. Include evidence paths where available.",
    "invariants, completion_criteria and verification_requirements must each be non-empty. Completion criteria must describe end-to-end outcomes, not file existence.",
    "Do not expose private chain-of-thought. Return the decision product only.",
  ].join("\n");
}

export function buildAvantiqoCodeMissionSystemReasoningEnvelope({
  mission,
  learned_knowledge,
  canonical_context = {},
  repository_assessment,
} = {}) {
  const normalizedMission = missionShape(mission);
  const compactRepository = compactAvantiqoCodeMissionRepositoryAssessment(
    repository_assessment,
  );
  return {
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
    mission: normalizedMission,
    canonical_context: {
      ...bounded(canonical_context),
      product_constitution: AVANTIQO_PRODUCT_CONSTITUTION,
    },
    learned_knowledge: compactKnowledge(learned_knowledge),
    current_repository_evidence: compactRepository,
    authority: {
      mission_objective_authoritative: true,
      product_constitution_authoritative: true,
      repository_evidence_authoritative_only_for_observed_current_state: true,
      learned_knowledge_authoritative_only_with_verified_release_state: true,
      repository_assessment_selected_objective_authoritative: false,
      code_must_reinspect_before_mutation: true,
      authorization_effect: "NONE",
    },
  };
}

function structuredSystemReasoning(value = {}) {
  const source = object(value?.parsed || value);
  const nested = object(source.system_reasoning);
  return Object.keys(nested).length ? nested : source;
}

export function finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
  mission,
  learned_knowledge,
  canonical_context = {},
  repository_assessment,
  structured_reasoning,
} = {}) {
  const normalizedMission = missionShape(mission);
  const compactRepository = compactAvantiqoCodeMissionRepositoryAssessment(
    repository_assessment,
  );
  const reasoning = structuredSystemReasoning(structured_reasoning);
  const missionContext = createAvantiqoIntelligenceCodeMissionContext({
    mission: normalizedMission,
    complexity: {
      class: "large",
      classification_source: "GENERAL_INTELLIGENCE_SIGNIFICANT_CODE_MISSION",
    },
    canonical_context,
    learned_knowledge,
    repository_context: {
      repository_url: compactRepository.repository.repository_url,
      ref: compactRepository.repository.ref,
      head_sha: compactRepository.repository.current_main_head,
      observed_at: compactRepository.repository.observed_at,
    },
    system_reasoning: reasoning,
  });
  if (missionContext.contract !== AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT) {
    throw new Error("AVANTIQO_CODE_MISSION_SYSTEM_REASONING_CONTEXT_INVALID");
  }
  return {
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
    status: "READY_FOR_CODE",
    mission_context: missionContext,
    repository_assessment: {
      contract: compactRepository.contract,
      status: compactRepository.status,
      current_main_head: compactRepository.repository.current_main_head,
      observed_at: compactRepository.repository.observed_at,
      evidence_file_count: compactRepository.evidence_files.length,
      bounded_repository_evidence: compactRepository.repository.bounded_repository_evidence,
      full_repository_certification: compactRepository.repository.full_repository_certification,
      evidence_limits: compactRepository.evidence_limits,
    },
    governance: {
      general_intelligence_only: true,
      code_execution_started: false,
      source_mutation_performed: false,
      database_mutation_performed: false,
      deployment_performed: false,
      knowledge_promotion_performed: false,
      repository_assessment_selected_objective_replaced_mission: false,
      current_repository_must_be_reinspected_by_code: true,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export async function runAvantiqoIntelligenceCodeMissionSystemReasoning({
  context = {},
  mission,
  learned_knowledge,
  canonical_context = {},
  repositoryUrl = DEFAULT_REPOSITORY,
  ref = DEFAULT_REF,
  verifiedCommitSha = null,
  timeoutMs = null,
  dependencies = {},
} = {}) {
  const normalizedMission = missionShape(mission);
  const provided = object(dependencies);
  let assessRepository = provided.assessRepository;
  let runStructuredSupervisor = provided.runStructuredSupervisor;

  if (typeof assessRepository !== "function") {
    const module = await import("./AvantiqoProductRepositoryAssessmentRuntime.js");
    assessRepository = module.assessAvantiqoCurrentRepository;
  }
  if (typeof runStructuredSupervisor !== "function") {
    const module = await import("./AvantiqoStructuredIntelligenceSupervisorRuntime.js");
    runStructuredSupervisor = module.AvantiqoStructuredIntelligenceSupervisorRuntime.run;
  }

  const repositoryAssessment = await assessRepository({
    context,
    repositoryUrl,
    ref,
    verifiedCommitSha,
    focus: normalizedMission.objective,
    timeoutMs,
  });
  const envelope = buildAvantiqoCodeMissionSystemReasoningEnvelope({
    mission: normalizedMission,
    learned_knowledge,
    canonical_context,
    repository_assessment: repositoryAssessment,
  });

  const structured = await runStructuredSupervisor({
    organization_id: text(context.organizationId || context.organization_id, 160),
    party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
    entity_id: text(context.entityId || context.entity_id, 160) || null,
    system: avantiqoCodeMissionSystemReasoningSystemPrompt(),
    messages: [{
      role: "user",
      content: JSON.stringify(envelope),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE",
      operation: "CODE_MISSION_SYSTEM_REASONING",
      intelligence_code_mission_system_reasoning_contract:
        AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
      repository_head:
        envelope.current_repository_evidence.repository.current_main_head,
      repository_evidence_read_only: true,
      general_intelligence_only: true,
      code_execution_started: false,
      raw_reasoning_persisted: false,
    },
    mode: "deep",
    critique_instructions: [
      "Reject implementation claims unsupported by supplied current-main repository evidence.",
      "Reject any attempt to replace the mission with the repository assessment's independently selected objective.",
      "Reject architecture that duplicates an existing shared primitive when evidence shows a reusable primitive already exists.",
      "Reject local-only reasoning when the mission changes a shared contract or cross-domain runtime.",
      "Require predictable future requirements and expensive-to-change decisions without inflating feature scope.",
      "Require explicit invariants, boundary conditions, cross-system consequences, completion criteria and deterministic verification requirements.",
      "Preserve evidence limits and uncertainty. Code must re-inspect newest main before mutation.",
      "Do not produce source code or authorize execution.",
    ].join(" "),
    max_output_tokens: 4200,
  });

  const finalized = finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
    mission: normalizedMission,
    learned_knowledge,
    canonical_context,
    repository_assessment: repositoryAssessment,
    structured_reasoning: structured,
  });
  return {
    ...finalized,
    reasoning_execution: {
      repository_assessment_contract:
        text(repositoryAssessment?.contract, 180) || null,
      structured_supervisor_contract: text(structured?.contract, 180) || null,
      structured_supervisor_mode: text(structured?.mode, 40) || "deep",
      repository_assessment_reasoning_call_ceiling: 1,
      system_reasoning_call_ceiling: 3,
      total_general_reasoning_call_ceiling: 4,
      code_reasoning_calls_consumed: 0,
      no_general_code_implementation: true,
    },
  };
}

export const AvantiqoIntelligenceCodeMissionSystemReasoningRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
  buildEnvelope: buildAvantiqoCodeMissionSystemReasoningEnvelope,
  finalize: finalizeAvantiqoIntelligenceCodeMissionSystemReasoning,
  run: runAvantiqoIntelligenceCodeMissionSystemReasoning,
});

export default AvantiqoIntelligenceCodeMissionSystemReasoningRuntime;
