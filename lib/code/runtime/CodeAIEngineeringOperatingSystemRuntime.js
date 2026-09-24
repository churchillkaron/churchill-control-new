import crypto from "node:crypto";

import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";
import { coordinateCodeAIMultiRepositoryMission } from "./CodeAIMultiRepositoryMissionRuntime.js";
import { isCodeAIExplicitReadOnlyIntent } from "./CodeAIReadOnlyIntentRuntime.js";

export const CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_OPERATING_SYSTEM_V1";

const MAX_DIRECTIVE_CHARS = 14000;
const DEFECT = /\b(fix|bug|broken|error|failure|fail|regression|wrong|issue|incident|repair|debug)\b/i;
const UI = /\b(ui|ux|page|screen|form|button|layout|browser|frontend|react|next\.js|mobile|responsive|visual)\b/i;
const DATABASE = /\b(database|postgres|supabase|sql|schema|migration|table|rpc|rls|query|index)\b/i;
const SECURITY = /\b(auth|authorization|permission|security|secret|token|tenant|organization|payment|wallet|bank|invoice|customer data|pii|rls)\b/i;
const PERFORMANCE = /\b(performance|latency|slow|slower|fast|faster|speed|memory|cpu|bundle|web vital|query count|build time|throughput|load time)\b/i;
const RUNTIME = /\b(api|runtime|production|server|worker|queue|webhook|integration|network|log|trace|telemetry|incident)\b/i;
const BROAD_PROGRAM = /\b(release ready|production ready|world.?class|end[- ]to[- ]end|entire|whole|all capabilities|full audit|platform|department|ready for customers|ready for accounting|upgrade everything)\b/i;
const MULTI_REPO = /\b(multi[- ]repo|multiple repos|frontend repo|backend repo|mobile repo|infra repo|repository set)\b/i;

function text(value, maximum = 6000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function unique(values) { return [...new Set(values.map((value) => text(value, 1200)).filter(Boolean))]; }
function bool(value) { return value === true; }
function lower(value) { return text(value, 12000).toLowerCase(); }
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function changedPaths(state = {}) {
  return unique([
    ...list(state.files_changed),
    ...list(state.source_changes).map((entry) => entry?.path),
  ]).slice(0, 120);
}
function pathMatches(paths, pattern) { return paths.some((path) => pattern.test(path)); }
function evidence(state = {}) { return list(state.evidence); }
function verification(state = {}) { return list(state.verification); }
function successfulTests(state = {}) {
  return list(state.tests).filter((item) => Number(item?.exit_code) === 0 || item?.passed === true);
}
function operationSucceeded(entry = {}) {
  if (entry?.status !== "completed") return false;
  const result = object(entry?.result);
  if (result.passed === false) return false;
  if (Number.isFinite(Number(result.exit_code))) return Number(result.exit_code) === 0;
  return result.passed === true;
}
function operationFailed(entry = {}) {
  if (entry?.status !== "completed") return false;
  const result = object(entry?.result);
  if (result.passed === false) return true;
  return Number.isFinite(Number(result.exit_code)) && Number(result.exit_code) !== 0;
}
function operationIndex(state, predicate) {
  return evidence(state).findIndex((entry) => entry?.kind === "operation" && predicate(entry));
}
function hasVerificationFamily(state, family) {
  return verification(state).some((item) => item?.passed === true && lower(item?.family) === family);
}
function hasSuccessfulVerification(state) {
  return verification(state).some((item) => item?.passed === true) || successfulTests(state).length > 0;
}
function behavioralAdversarialProof(value = {}) {
  const source = object(value);
  if (source.verified !== true) return false;
  return Number(source.matched_impacted_test_count || 0) > 0 ||
    list(source.broad_test_operation_ids).length > 0;
}
function runtimeEvidenceCount(state = {}) {
  const explicit = Number(state?.runtime_evidence?.evidence_count || state?.world_class_intelligence?.runtime_evidence_count || 0);
  const observed = evidence(state).filter((entry) => /browser|runtime|trace|log|metric|network/i.test(text(entry?.kind, 120))).length;
  return Math.max(Number.isFinite(explicit) ? explicit : 0, observed);
}
function postMutationObservabilityProof(state = {}, applyIndex = -1) {
  if (applyIndex < 0) return runtimeEvidenceCount(state) > 0 || list(state?.observability_evidence?.records).length > 0;
  if (state?.runtime_evidence?.post_mutation_verified === true) return true;
  const operations = evidence(state);
  const successfulPostMutationOperationIds = new Set(
    operations
      .filter((entry, index) =>
        index > applyIndex &&
        entry?.kind === "operation" &&
        operationSucceeded(entry) &&
        text(entry?.operation_id, 240)
      )
      .map((entry) => text(entry.operation_id, 240))
  );
  if (!successfulPostMutationOperationIds.size) return false;
  return list(state?.observability_evidence?.records).some((record) =>
    list(record?.evidence_operation_ids).some((id) =>
      successfulPostMutationOperationIds.has(text(id, 240))
    )
  );
}
function repositoryRisk(state = {}) {
  return lower(state?.repository_impact?.risk || state?.world_class_intelligence?.repository_impact?.risk || "standard") || "standard";
}

export function classifyCodeAIEngineeringMission({ objective, state = {}, objective_context = {} } = {}) {
  const source = `${text(objective, 12000)}\n${changedPaths(state).join("\n")}`;
  const paths = changedPaths(state);
  const defect = DEFECT.test(source);
  const ui = UI.test(source) || pathMatches(paths, /(^|\/)(app|pages|components|src\/app)\//i) || pathMatches(paths, /\.(jsx|tsx|css|scss)$/i);
  const database = DATABASE.test(source) || pathMatches(paths, /(^|\/)(supabase\/migrations|migrations|database|db)\//i) || pathMatches(paths, /\.sql$/i);
  const security = SECURITY.test(source) || pathMatches(paths, /(auth|security|permission|access|rls|payment|wallet|bank|invoice)/i);
  const performance = PERFORMANCE.test(source);
  const runtime = RUNTIME.test(source) || pathMatches(paths, /(^|\/)app\/api\//i) || pathMatches(paths, /(runtime|worker|queue|webhook)/i);
  const broadProgram = BROAD_PROGRAM.test(source);
  const multiRepo = MULTI_REPO.test(source) || list(objective_context?.repositories).length > 1;
  const risk = repositoryRisk(state);
  const highRisk = ["high", "critical"].includes(risk) || database || security;
  return {
    defect,
    ui,
    database,
    security,
    performance,
    runtime,
    broad_program: broadProgram,
    multi_repo: multiRepo,
    risk,
    high_risk: highRisk,
    changed_paths: paths,
  };
}

function architectureBrain(state) {
  const graph = deriveCodeAICausalGraph(state);
  const snapshot = {
    contract: "AVANTIQO_CODE_ARCHITECTURE_BRAIN_V1",
    graph,
    graph_hash: hash(graph),
    repository_head: text(state?.base_commit, 160) || null,
    persistence: "ATTESTED_MISSION_STATE_AND_MISSION_HISTORY",
    incremental_refresh_required_after_verified_change: true,
    authority_effect: "NONE",
  };
  return snapshot;
}

function agentTeam(classification) {
  const roles = [
    "REPOSITORY_INVESTIGATOR",
    "IMPLEMENTER",
    "TEST_ENGINEER",
    "FINAL_ADVERSARIAL_REVIEWER",
  ];
  if (classification.high_risk || classification.broad_program) roles.push("ARCHITECT");
  if (classification.ui) roles.push("BROWSER_UX_REVIEWER");
  if (classification.database) roles.push("DATABASE_MIGRATION_REVIEWER");
  if (classification.security) roles.push("SECURITY_REVIEWER");
  if (classification.performance) roles.push("PERFORMANCE_REVIEWER");
  if (classification.runtime) roles.push("RUNTIME_OBSERVABILITY_REVIEWER");
  return {
    contract: "AVANTIQO_CODE_ENGINEERING_TEAM_V1",
    roles: unique(roles),
    independent_evidence_required: true,
    independent_veto_roles: unique([
      "FINAL_ADVERSARIAL_REVIEWER",
      classification.security ? "SECURITY_REVIEWER" : null,
      classification.database ? "DATABASE_MIGRATION_REVIEWER" : null,
    ]),
    shared_chain_of_thought: false,
    decision_records_only: true,
  };
}

function programPlan(classification) {
  if (!classification.broad_program) return {
    active: false,
    contract: "AVANTIQO_CODE_ENGINEERING_PROGRAM_MANAGER_V1",
    workstreams: [],
  };
  const workstreams = [
    "DISCOVER_AND_BASELINE",
    "ARCHITECTURE_AND_BLAST_RADIUS",
    "IMPLEMENT_AND_REPAIR",
    "VERIFY_AND_ADVERSARIAL_TEST",
    "INDEPENDENT_REVIEW_AND_RELEASE_READINESS",
  ];
  if (classification.database) workstreams.splice(2, 0, "DATABASE_CHANGE_DEPARTMENT");
  if (classification.security) workstreams.splice(-1, 0, "SECURITY_CERTIFICATION");
  if (classification.performance) workstreams.splice(-1, 0, "PERFORMANCE_REGRESSION_CERTIFICATION");
  return {
    active: true,
    contract: "AVANTIQO_CODE_ENGINEERING_PROGRAM_MANAGER_V1",
    workstreams,
    dependency_aware: true,
    parallelize_only_independent_work: true,
    mutation_authority: false,
  };
}

function routingPolicy(classification, objectiveContext) {
  return {
    contract: "AVANTIQO_CODE_DYNAMIC_INTELLIGENCE_ROUTING_V1",
    preferred_lane: "NODE01_LOCAL_FIRST",
    workspace_target: text(objectiveContext?.workspace_target, 80).toUpperCase() || "SANDBOX",
    local_fast_for: ["bounded inspection", "simple repair", "classification", "deterministic verification"],
    local_deep_for: ["architecture reasoning", "ambiguous debugging", "specialist review"],
    modal_allowed_only_when: [
      "LOCAL_CAPACITY_INSUFFICIENT",
      "MODEL_CONTEXT_OR_COMPUTE_REQUIREMENT_EXCEEDS_LOCAL_BOUND",
      "OWNER_GOVERNED_ESCALATION_APPROVED",
    ],
    external_frontier_allowed: false,
    estimated_complexity: classification.broad_program || classification.high_risk ? "DEEP" : "NORMAL",
    cost_surprise_allowed: false,
  };
}

function departmentMatrix(classification) {
  return [
    { id: 1, key: "architecture_brain", name: "Persistent Architecture Brain", required: true },
    { id: 2, key: "multi_agent_team", name: "Multi-agent engineering team", required: classification.high_risk || classification.broad_program },
    { id: 3, key: "reproduction_first", name: "Reproduction-first engineering", required: classification.defect },
    { id: 4, key: "hypothesis_debugging", name: "Hypothesis-based debugging", required: classification.defect },
    { id: 5, key: "durable_runtime", name: "Durable mission runtime", required: true },
    { id: 6, key: "browser_verification", name: "Browser/computer verification", required: classification.ui },
    { id: 7, key: "database_department", name: "Database engineering department", required: classification.database },
    { id: 8, key: "scm_multi_repo", name: "Branch, PR and multi-repository governance", required: classification.multi_repo },
    { id: 9, key: "adversarial_testing", name: "Adversarial test generation", required: classification.high_risk || classification.defect },
    { id: 10, key: "runtime_observability", name: "Runtime observability reasoning", required: classification.runtime },
    { id: 11, key: "performance_proof", name: "Performance/regression evidence", required: classification.performance },
    { id: 12, key: "security_engineering", name: "Security engineering reviewer", required: classification.security },
    { id: 13, key: "engineering_memory", name: "Verified engineering memory", required: true },
    { id: 14, key: "self_improvement", name: "Verified-mission self-improvement", required: true },
    { id: 15, key: "dynamic_routing", name: "Dynamic intelligence routing", required: true },
    { id: 16, key: "program_manager", name: "Autonomous engineering program manager", required: classification.broad_program },
    { id: 17, key: "hidden_benchmark", name: "Hidden engineering benchmark certification", required: classification.broad_program },
  ];
}

function directiveFor({ classification, departments, agents, program, routing }) {
  const required = departments.filter((item) => item.required).map((item) => `${item.id}.${item.name}`).join(" | ");
  return [
    "AVANTIQO ENGINEERING OPERATING SYSTEM V1 — MANDATORY MISSION CONSTITUTION",
    `REQUIRED DEPARTMENTS: ${required}`,
    `ENGINEERING TEAM: ${agents.roles.join(", ")}. Independent reviewers must use evidence and may veto completion; never expose or persist private chain-of-thought.`,
    classification.defect
      ? "REPRODUCTION/HYPOTHESIS GATE: reproduce the reported defect before source mutation whenever technically possible. Record observable failing evidence. Generate at least three plausible causal hypotheses when ambiguity remains, run the cheapest discriminating checks first, eliminate contradicted hypotheses, then mutate only after the cause is localized. Re-run the same reproduction after the repair."
      : "REPRODUCTION GATE: not mandatory for this non-defect objective, but preserve before/after evidence when behavior changes.",
    classification.ui
      ? "BROWSER DEPARTMENT: verify affected user flows in a real browser. Capture HTTP/navigation result, console errors, page errors, failed network requests and screenshot evidence. Exercise relevant forms/states instead of relying only on static tests."
      : null,
    classification.database
      ? "DATABASE DEPARTMENT: treat schema/persistence changes separately from ordinary source mutation. Require dependency analysis, migration compatibility, RLS/permission impact, dry-run or targeted integration proof, rollback reasoning and application-level verification before release readiness."
      : null,
    classification.security
      ? "SECURITY DEPARTMENT: independently review authorization scope, tenant/organization isolation, secrets, input boundaries, SSRF/injection, privilege escalation and sensitive-data exposure. Security review may veto completion."
      : null,
    classification.performance
      ? "PERFORMANCE DEPARTMENT: record a before/after performance measurement relevant to the change (latency, queries, build, bundle, memory, CPU or web vitals). Do not claim an improvement without measured evidence."
      : null,
    classification.runtime
      ? "OBSERVABILITY LOOP: correlate source hypotheses with runtime evidence such as logs, traces, network failures, metrics or exact API behavior whenever those signals are available."
      : null,
    classification.high_risk || classification.defect
      ? "ADVERSARIAL TESTING: actively search for ways the implementation can look correct while being wrong: boundary inputs, permissions, concurrency, malformed data, failure paths, backward compatibility and changed-test self-certification."
      : null,
    classification.multi_repo
      ? "SCM/MULTI-REPO: preserve independent repository heads, protected-branch policy and cross-repository dependency ordering. Do not directly mutate or merge another repository without its own governed evidence and delivery approval."
      : "SCM: preserve current governed commit/release separation. Direct git push/deploy from an engineering workspace remains forbidden.",
    `INTELLIGENCE ROUTING: ${routing.preferred_lane}. Modal or another expensive lane is escalation-only and never automatic merely because a task is difficult.`,
    program.active
      ? `PROGRAM MANAGER: execute dependency-aware workstreams: ${program.workstreams.join(" -> ")}. Parallelize only independent work and retain durable checkpoints.`
      : null,
    "MEMORY/SELF-IMPROVEMENT: reuse only verified engineering memory and formed skills. After independently verified completion, emit structured learning evidence; failed/rejected approaches remain negative evidence and never become trusted knowledge automatically.",
    "HIDDEN BENCHMARK: broad release-readiness claims require held-out engineering benchmark evidence. Never infer superiority from hand-picked demos or the same tests used during implementation.",
    "COMPLETION RULE: implementation confidence is not proof. A required department without its required evidence remains a blocker or explicit readiness gap.",
  ].filter(Boolean).join("\n").slice(0, MAX_DIRECTIVE_CHARS);
}

export function prepareCodeAIEngineeringOperatingSystem(options = {}) {
  const state = object(options.resume_state);
  const objectiveContext = object(options.objective_context || state.objective_context);
  const classification = classifyCodeAIEngineeringMission({
    objective: options.objective,
    state,
    objective_context: objectiveContext,
  });
  const departments = departmentMatrix(classification);
  const architecture = architectureBrain(state);
  const priorArchitectureBrain = object(objectiveContext.prior_architecture_brain);
  const agents = agentTeam(classification);
  const program = programPlan(classification);
  const routing = routingPolicy(classification, objectiveContext);
  let multiRepositoryCoordination = null;
  if (classification.multi_repo && list(objectiveContext.repositories).length > 1) {
    multiRepositoryCoordination = coordinateCodeAIMultiRepositoryMission({
      repositories: objectiveContext.repositories,
      dependencies: objectiveContext.repository_dependencies,
    });
  }
  const control = {
    contract: CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
    version: 1,
    classification,
    departments,
    architecture_brain: architecture,
    prior_architecture_brain: Object.keys(priorArchitectureBrain).length ? priorArchitectureBrain : null,
    prior_architecture_brain_requires_current_head_revalidation: Object.keys(priorArchitectureBrain).length > 0,
    engineering_team: agents,
    reproduction: {
      required: classification.defect,
      same_reproduction_before_after_required: classification.defect,
      mutation_before_reproduction_allowed_only_when_reproduction_impossible: true,
    },
    hypothesis_debugging: {
      required: classification.defect,
      minimum_hypotheses_when_ambiguous: classification.defect ? 3 : 0,
      falsification_first: true,
    },
    durable_runtime: {
      required: true,
      persistence: "ATTESTED_MISSION_STATE_AND_EXECUTION_STATE",
      resume_after_process_or_device_restart: true,
    },
    browser_department: { required: classification.ui, real_browser_required: classification.ui },
    database_department: { required: classification.database, rollback_reasoning_required: classification.database, rls_review_required: classification.database },
    scm: { branch_pr_governance: true, multi_repository_required: classification.multi_repo, direct_push_from_workspace: false },
    multi_repository_coordination: multiRepositoryCoordination,
    adversarial_testing: { required: classification.high_risk || classification.defect, changed_test_only_proof_accepted_for_high_risk: false },
    observability: { required: classification.runtime, source_to_runtime_correlation: true },
    performance: { required: classification.performance, before_after_measurement_required: classification.performance },
    security: { required: classification.security, independent_veto: classification.security },
    engineering_memory: { required: true, verified_only: true },
    self_improvement: { required: true, verified_outcomes_only: true, automatic_trust_promotion: false },
    routing,
    program_manager: program,
    benchmark: { required: classification.broad_program, hidden_cases_required: classification.broad_program, hand_picked_demo_sufficient: false },
    authority: { mutation: false, commit: false, deploy: false, migration: false },
  };
  const readOnlyFastPath = isCodeAIExplicitReadOnlyIntent(
    options.objective,
    objectiveContext.owner_objective,
    state.objective,
  );
  const directive = [
    readOnlyFastPath
      ? [
          "AVANTIQO ENGINEERING OS V1 — READ-ONLY FAST PATH",
          "AUTHORITY: source mutation, commit, deploy and migration are forbidden.",
          "EVIDENCE: use exact current repository evidence; prefer owner-named paths and do not broaden scope after the requested facts are proven.",
          "COMPLETION: report observed facts only. Missing evidence remains unknown. Preserve attestation and durable checkpoints.",
        ].join("\n")
      : directiveFor({ classification, departments, agents, program, routing }),
    Object.keys(priorArchitectureBrain).length
      ? `PERSISTENT ARCHITECTURE BRAIN: prior integrity-verified graph available from mission ${text(priorArchitectureBrain.mission_id, 240)} at head ${text(priorArchitectureBrain.repository_head, 160)}. Reuse it only as advisory evidence and revalidate against the current repository head before mutation.`
      : null,
  ].filter(Boolean).join("\n").slice(0, MAX_DIRECTIVE_CHARS);
  return {
    control,
    directive,
    objective: [text(options.objective, 12000), directive].filter(Boolean).join("\n\n").slice(0, 28000),
    objective_context: {
      ...objectiveContext,
      engineering_operating_system_contract: CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
      engineering_os_required_department_ids: departments.filter((item) => item.required).map((item) => item.id),
      engineering_os_local_first: true,
      engineering_os_program_mode: program.active,
    },
  };
}

function readinessSignals(state, classification, routing = {}) {
  const applyIndex = operationIndex(state, (entry) => entry?.action === "apply_files" || entry?.action === "patch");
  const preMutationFailureObserved = evidence(state).some((entry, index) =>
    (applyIndex < 0 || index < applyIndex) &&
    entry?.kind === "operation" &&
    ["verify", "run", "browser_verify"].includes(entry?.action) &&
    operationFailed(entry)
  );
  const postMutationVerification = evidence(state).some((entry, index) =>
    index > applyIndex &&
    entry?.kind === "operation" &&
    ["verify", "run", "browser_verify"].includes(entry?.action) &&
    operationSucceeded(entry)
  );
  const graph = deriveCodeAICausalGraph(state);
  const memoryObserved = Boolean(
    state?.verified_engineering_memory?.contract &&
    state?.verified_engineering_memory?.evaluated === true &&
    state?.verified_engineering_memory?.current_head_revalidation_required === true
  );
  const selfImprovementObserved = Boolean(
    state?.formed_engineering_skills?.contract &&
    state?.formed_engineering_skills?.evaluated === true &&
    state?.formed_engineering_skills?.lifecycle_evaluated === true &&
    state?.formed_engineering_skills?.automatic_knowledge_promotion === false
  );
  const routingObserved = Boolean(
    routing?.contract === "AVANTIQO_CODE_DYNAMIC_INTELLIGENCE_ROUTING_V1" &&
    routing?.preferred_lane === "NODE01_LOCAL_FIRST" &&
    ["NORMAL", "DEEP"].includes(routing?.estimated_complexity) &&
    routing?.external_frontier_allowed === false &&
    routing?.cost_surprise_allowed === false
  );
  const specialistReview = Boolean(
    state?.parallel_specialist_review?.complete === true ||
    state?.strategic_review?.complete === true ||
    state?.employee_completion?.specialist_review?.complete === true
  );
  const independentReview = Boolean(
    state?.final_independent_review?.complete === true ||
    state?.employee_completion?.final_review?.complete === true ||
    state?.employee_completion?.verified === true
  );
  return {
    architecture_brain: graph.node_count > 0 || changedPaths(state).length === 0,
    multi_agent_team: !classification.high_risk && !classification.broad_program ? true : specialistReview || independentReview,
    reproduction_first: !classification.defect || Boolean(
      state?.reproduction?.exact_before_after_observed === true &&
      text(state?.reproduction?.exact_reproduction_key, 240)
    ) || (preMutationFailureObserved && postMutationVerification),
    hypothesis_debugging: !classification.defect ||
      list(state?.hypothesis_debugging?.hypotheses).length >= 3 ||
      evidence(state).some((entry) =>
        entry?.kind === "causal_hypothesis_record" && list(entry?.hypotheses).length >= 3
      ),
    durable_runtime: Boolean(text(state?.mission_id, 240) || state?.attestation),
    browser_verification: !classification.ui ||
      hasVerificationFamily(state, "browser") ||
      evidence(state).some((entry) =>
        entry?.action === "browser_verify" &&
        entry?.status === "completed" &&
        entry?.result?.passed === true
      ),
    database_department: !classification.database || Boolean(
      state?.database_review?.passed === true &&
      (applyIndex >= 0 ? postMutationVerification : hasSuccessfulVerification(state))
    ),
    scm_multi_repo: !classification.multi_repo || Boolean(state?.multi_repository_coordination?.all_verified === true || state?.engineering_operating_system?.multi_repository_coordination?.all_verified === true),
    adversarial_testing: !(classification.high_risk || classification.defect) || Boolean(
      behavioralAdversarialProof(state?.behavioral_verification) ||
      behavioralAdversarialProof(state?.employee_completion?.behavioral_verification) ||
      (
        state?.precision_evidence?.mutation_testing?.passed === true &&
        state?.precision_evidence?.mutation_testing?.verified === true
      ) ||
      (
        state?.precision_evidence?.property_fuzz?.passed === true &&
        state?.precision_evidence?.property_fuzz?.verified === true
      )
    ),
    runtime_observability: !classification.runtime || postMutationObservabilityProof(state, applyIndex),
    performance_proof: !classification.performance || Boolean(state?.performance_evidence?.passed === true || state?.engineering_performance?.verified === true),
    security_engineering: !classification.security || Boolean(
      state?.security_review?.passed === true &&
      (specialistReview || independentReview) &&
      (applyIndex >= 0 ? postMutationVerification : hasSuccessfulVerification(state))
    ),
    engineering_memory: memoryObserved,
    self_improvement: selfImprovementObserved,
    dynamic_routing: routingObserved,
    program_manager: !classification.broad_program || Boolean(state?.product_portfolio || state?.program_plan || state?.engineering_program),
    hidden_benchmark: !classification.broad_program || Boolean(
      state?.hidden_benchmark_certification?.verified === true ||
      (
        state?.competitive_benchmark?.attested === true &&
        state?.competitive_benchmark?.competitive_certified === true &&
        state?.competitive_benchmark?.evidence_current === true
      ) ||
      (
        state?.benchmark_scorecard?.held_out === true &&
        state?.benchmark_scorecard?.verified === true
      )
    ),
  };
}

export function finalizeCodeAIEngineeringOperatingSystem({ prepared_control = null, result = null } = {}) {
  const prepared = object(prepared_control);
  const resultObject = object(result);
  const state = object(resultObject.state || resultObject);
  const classification = Object.keys(object(prepared.classification)).length
    ? object(prepared.classification)
    : classifyCodeAIEngineeringMission({ objective: state.objective, state, objective_context: state.objective_context });
  const signals = readinessSignals(state, classification, object(prepared.routing));
  const departments = list(prepared.departments).length ? list(prepared.departments) : departmentMatrix(classification);
  const readiness = departments.map((department) => ({
    ...department,
    satisfied: department.required ? bool(signals[department.key]) : true,
  }));
  const missing = readiness.filter((item) => item.required && !item.satisfied);
  return {
    ...prepared,
    contract: CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
    classification,
    architecture_brain: architectureBrain(state),
    department_readiness: readiness,
    required_department_count: readiness.filter((item) => item.required).length,
    satisfied_required_department_count: readiness.filter((item) => item.required && item.satisfied).length,
    missing_required_departments: missing.map((item) => ({ id: item.id, key: item.key, name: item.name })),
    engineering_os_ready: missing.length === 0,
    mission_success_claimed: resultObject.success === true,
    completion_claim_requires_all_required_departments: true,
    authority: { mutation: false, commit: false, deploy: false, migration: false },
    finalized_at: new Date().toISOString(),
  };
}

export function assertCodeAIEngineeringOSCommitReady(state = {}) {
  const os = object(state.engineering_operating_system);
  if (!Object.keys(os).length) return true;
  if (text(os.contract, 180) !== CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT) {
    throw new Error("CODE_AI_ENGINEERING_OS_CONTRACT_INVALID");
  }
  if (os.engineering_os_ready !== true) {
    const missing = list(os.missing_required_departments).map((item) => text(item?.key, 120)).filter(Boolean);
    const error = new Error(`CODE_AI_ENGINEERING_OS_REQUIRED_PROOF_MISSING${missing.length ? `:${missing.join(",")}` : ""}`);
    error.missing_required_departments = missing;
    throw error;
  }
  return true;
}

export const CodeAIEngineeringOperatingSystemRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_OPERATING_SYSTEM_CONTRACT,
  classify: classifyCodeAIEngineeringMission,
  prepare: prepareCodeAIEngineeringOperatingSystem,
  finalize: finalizeCodeAIEngineeringOperatingSystem,
  assertCommitReady: assertCodeAIEngineeringOSCommitReady,
});

export default CodeAIEngineeringOperatingSystemRuntime;
