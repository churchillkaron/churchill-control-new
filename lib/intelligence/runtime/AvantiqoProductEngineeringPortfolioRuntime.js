import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT =
  "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "product_engineering_portfolio_state";
const MEMORY_SOURCE = "product_engineering_portfolio_runtime";
const MAX_NODES = 4;
const MAX_HISTORY = 16;
const MAX_COMPLETION_CRITERIA = 6;
const ACTIVE_NODE_STATES = new Set([
  "RUNNING_LOCAL_ENGINEERING",
  "WAITING_GOVERNED_PERSISTENCE",
  "WAITING_VERIFIED_PERSISTENCE",
  "STALE_BASE_REPLAN_REQUIRED",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function normalizedRepository(value) {
  return text(value, 1000)
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function normalizedObjective(value) {
  return text(value, 5000)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stableArea(filePath) {
  const path = text(filePath, 1000).replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "app" && parts[1] === "api") return parts.slice(0, 4).join("/");
  if (parts[0] === "lib") return parts.slice(0, 3).join("/");
  if (parts[0] === "components") return parts.slice(0, 2).join("/");
  if (parts[0] === "services") return parts.slice(0, 2).join("/");
  if (parts[0] === "supabase") return parts.slice(0, 2).join("/");
  if (["tests", "scripts", "docs"].includes(parts[0])) return parts.slice(0, 2).join("/");
  return parts.slice(0, 2).join("/");
}

function unique(values, limit = 100) {
  return [...new Set(list(values).map((item) => text(item, 2000)).filter(Boolean))]
    .slice(0, limit);
}

function candidateSignature(candidate = {}) {
  const objective = normalizedObjective(candidate.objective);
  const evidence = unique(candidate.evidence_paths).sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ objective, evidence }), "utf8")
    .digest("hex")
    .slice(0, 32);
}

function nodeId(candidate = {}) {
  return `portfolio-node:${candidateSignature(candidate)}`;
}

function portfolioId({ actor, businessGoal, repositoryUrl }) {
  return `product-portfolio:${crypto
    .createHash("sha256")
    .update(`${actor}:${normalizedObjective(businessGoal)}:${normalizedRepository(repositoryUrl)}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

function memoryKey(actor, id) {
  return `product_engineering_portfolio:v1:${crypto
    .createHash("sha256")
    .update(`${actor}:${id}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

function candidateToNode(candidate = {}, index = 0, higherNodes = []) {
  const evidencePaths = unique(candidate.evidence_paths, 20);
  const evidenceAreas = unique(evidencePaths.map(stableArea), 12);
  const dependencies = [];
  const overlapEvidence = [];

  for (const higher of higherNodes) {
    const exactOverlap = evidencePaths.filter((path) =>
      list(higher.evidence_paths).includes(path),
    );
    const areaOverlap = evidenceAreas.filter((area) =>
      list(higher.evidence_areas).includes(area),
    );
    if (!exactOverlap.length && !areaOverlap.length) continue;
    dependencies.push(higher.node_id);
    overlapEvidence.push({
      depends_on_node_id: higher.node_id,
      exact_path_overlap: exactOverlap,
      stable_area_overlap: areaOverlap,
      reason: exactOverlap.length
        ? "EXACT_REPOSITORY_EVIDENCE_PATH_OVERLAP"
        : "STABLE_REPOSITORY_AREA_OVERLAP",
    });
  }

  const weightedScore = Number(candidate.weighted_score || 0);
  return {
    node_id: nodeId(candidate),
    source_candidate_id: text(candidate.id, 160) || null,
    objective: text(candidate.objective, 5000) || null,
    user_outcome: text(candidate.user_outcome, 1600) || null,
    rationale: text(candidate.rationale, 1600) || null,
    rank: index + 1,
    weighted_score: Number.isFinite(weightedScore) ? weightedScore : 0,
    evidence_paths: evidencePaths,
    evidence_areas: evidenceAreas,
    completion_criteria: unique(candidate.completion_criteria, MAX_COMPLETION_CRITERIA),
    dependencies,
    dependency_evidence: overlapEvidence,
    independent_evidence_scope: dependencies.length === 0 && index > 0,
    execution_serialized_by_main_only: true,
    provisional_until_fresh_main_reassessment: index > 0,
    status: index === 0 ? "READY" : "QUEUED_REASSESSMENT",
    execution_key: null,
    mission_id: null,
    persistence_state: null,
    persistence_confirmation_required: false,
    verified_commit_sha: null,
    completed_at: null,
  };
}

function roadmapFromAssessment(assessment = {}) {
  const selection = object(assessment.objective_selection || assessment?.assessment?.objective_selection);
  const candidates = list(selection.ranked_candidates).slice(0, MAX_NODES);
  const nodes = [];
  candidates.forEach((candidate, index) => {
    nodes.push(candidateToNode(candidate, index, nodes));
  });
  return {
    selection_contract: text(selection.contract, 200) || null,
    candidate_count: nodes.length,
    nodes,
  };
}

function safeHistoryEntry(entry = {}) {
  return {
    node_id: text(entry.node_id, 160) || null,
    objective: text(entry.objective, 1800) || null,
    candidate_signature: text(entry.candidate_signature, 80) || null,
    execution_key: text(entry.execution_key, 200) || null,
    mission_id: text(entry.mission_id, 240) || null,
    base_commit: text(entry.base_commit, 160) || null,
    verified_commit_sha: text(entry.verified_commit_sha, 160) || null,
    persistence_state: text(entry.persistence_state, 120) || null,
    completed_at: text(entry.completed_at, 120) || null,
    evidence_paths: unique(entry.evidence_paths, 20),
    completion_criteria_count: Number(entry.completion_criteria_count || 0),
    verified_business_acceptance: entry.verified_business_acceptance === true,
  };
}

function completedSignatures(portfolio = {}) {
  return new Set(
    list(portfolio.completed_objectives)
      .map((entry) => text(entry.candidate_signature, 80))
      .filter(Boolean),
  );
}

function activeNode(portfolio = {}) {
  const id = text(portfolio.current_node_id, 180);
  return list(portfolio.roadmap).find((node) => node.node_id === id) || null;
}

function portfolioStatusFromNode(node, fallback = "READY") {
  if (!node) return fallback;
  if (node.status === "RUNNING_LOCAL_ENGINEERING") return "ENGINEERING_ACTIVE";
  if (node.status === "WAITING_GOVERNED_PERSISTENCE") return "WAITING_GOVERNED_PERSISTENCE";
  if (node.status === "WAITING_VERIFIED_PERSISTENCE") return "WAITING_VERIFIED_PERSISTENCE";
  if (node.status === "STALE_BASE_REPLAN_REQUIRED") return "STALE_BASE_REPLAN_REQUIRED";
  if (node.status === "BLOCKED") return "BLOCKED";
  if (node.status === "PAUSED_LOCAL_ONLY") return "PAUSED_LOCAL_ONLY";
  return fallback;
}

function businessProgress(portfolio = {}) {
  const completed = list(portfolio.completed_objectives).length;
  const total = Math.max(completed + list(portfolio.roadmap).length, 1);
  return {
    persisted_verified_objective_count: completed,
    visible_roadmap_node_count: list(portfolio.roadmap).length,
    estimated_total_objective_count: total,
    percent: Math.min(100, Math.round((completed / total) * 100)),
  };
}

export function buildProductEngineeringPortfolio({
  context = {},
  businessGoal,
  repositoryUrl,
  ref = "main",
  repositoryAssessment,
  previousPortfolio = null,
  verifiedCommitSha = null,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const goal = text(businessGoal, 5000);
  if (!orgId) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ACTOR_REQUIRED");
  if (!goal) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_BUSINESS_GOAL_REQUIRED");
  if (text(ref, 160) !== "main") throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_MAIN_ONLY");

  const previous = object(previousPortfolio);
  const assessment = object(repositoryAssessment);
  const roadmap = roadmapFromAssessment(assessment);
  if (!roadmap.nodes.length) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_EVIDENCE_BACKED_ROADMAP_REQUIRED");
  }
  const snapshot = object(assessment.repository_snapshot);
  const currentHead = text(snapshot.current_main_head, 160);
  if (!currentHead) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CURRENT_MAIN_HEAD_REQUIRED");

  const completed = list(previous.completed_objectives).map(safeHistoryEntry).slice(-MAX_HISTORY);
  const seen = completedSignatures({ completed_objectives: completed });
  const repeated = roadmap.nodes.find((node) =>
    seen.has(candidateSignature(node)),
  );
  const antiLoopTriggered = Boolean(repeated && verifiedCommitSha);
  const id = text(previous.portfolio_id, 180) || portfolioId({
    actor,
    businessGoal: goal,
    repositoryUrl,
  });
  const revision = Math.max(1, Number(previous.revision || 0) + 1);
  const nodes = roadmap.nodes.map((node, index) => ({
    ...node,
    status: antiLoopTriggered && index === 0
      ? "NEEDS_PRODUCT_REVIEW"
      : node.status,
  }));

  const portfolio = {
    contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
    portfolio_id: id,
    organization_id: orgId,
    actor_id: actor,
    business_goal: goal,
    repository_url: text(repositoryUrl, 1000) || text(snapshot.repository_url, 1000) || null,
    ref: "main",
    current_main_head: currentHead,
    previous_main_head: text(previous.current_main_head, 160) || null,
    verified_commit_sha: text(verifiedCommitSha, 160) || null,
    revision,
    status: antiLoopTriggered ? "NEEDS_PRODUCT_REVIEW" : "READY",
    current_node_id: antiLoopTriggered ? null : nodes[0]?.node_id || null,
    current_execution_key: null,
    roadmap_selection_contract: roadmap.selection_contract,
    roadmap: nodes,
    completed_objectives: completed,
    anti_loop: {
      triggered: antiLoopTriggered,
      reason: antiLoopTriggered
        ? "REPEATED_OBJECTIVE_AFTER_VERIFIED_PERSISTENCE"
        : null,
      repeated_node_id: repeated?.node_id || null,
      repeated_objective: repeated?.objective || null,
      automatic_execution_allowed: !antiLoopTriggered,
    },
    executor_policy: {
      maximum_active_engineering_cycles: 1,
      parallel_code_execution_allowed: false,
      main_only: true,
      branch_or_worktree_fanout_allowed: false,
      fresh_main_reassessment_after_verified_persistence: true,
      fresh_main_reranking_required: true,
      provisional_queued_objectives_are_authoritative: false,
      cycles_started_per_invocation_maximum: 1,
      automatic_commit_allowed: false,
      automatic_deploy_allowed: false,
      automatic_migration_execution_allowed: false,
      unbounded_recursion_allowed: false,
    },
    evidence_policy: {
      source: "CURRENT_MAIN_PRODUCT_REPOSITORY_ASSESSMENT",
      ranked_candidates_reused_without_extra_planning_model_call: true,
      dependency_basis: "EXACT_PATH_OR_STABLE_AREA_OVERLAP",
      current_main_is_authoritative: true,
      raw_source_persisted: false,
      raw_patch_persisted: false,
      raw_reasoning_persisted: false,
    },
    created_at: text(previous.created_at, 120) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    authorization_effect: "NONE",
  };
  portfolio.business_progress = businessProgress(portfolio);
  return portfolio;
}

export function attachProductEngineeringCycleResult(portfolioValue = {}, cycleResult = {}) {
  const portfolio = structuredClone(object(portfolioValue));
  const node = activeNode(portfolio);
  if (!node) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ACTIVE_NODE_REQUIRED");
  if (list(portfolio.roadmap).filter((entry) => ACTIVE_NODE_STATES.has(entry.status)).length > 1) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_SINGLE_ACTIVE_CYCLE_VIOLATED");
  }

  const cycle = object(cycleResult);
  const mission = object(cycle.mission);
  const steps = list(mission.steps);
  const engineeringStep = steps.find((step) => text(step?.id, 120) === "engineer_next_gap");
  const engineeringWrapped = object(engineeringStep?.result);
  const engineering = Object.keys(object(engineeringWrapped.result)).length
    ? object(engineeringWrapped.result)
    : engineeringWrapped;
  const completion = object(engineering.employee_completion || engineering?.state?.employee_completion);
  const persistenceState = text(cycle.persistence_state, 120) || null;
  const confirmationRequired = cycle?.persistence_handoff?.confirmation_required === true ||
    cycle?.commit_requested === true;

  let status = "BLOCKED";
  if (confirmationRequired || persistenceState === "REQUEST_COMMIT_CONFIRMATION") {
    status = "WAITING_GOVERNED_PERSISTENCE";
  } else if (cycle.stale_base_replan_required === true) {
    status = "STALE_BASE_REPLAN_REQUIRED";
  } else if (cycle?.persistence_decision?.decision === "STAY_LOCAL") {
    status = "PAUSED_LOCAL_ONLY";
  } else if (text(cycle.status, 100) === "completed") {
    status = "WAITING_VERIFIED_PERSISTENCE";
  }

  node.status = status;
  node.execution_key = text(cycle.execution_key, 200) || null;
  node.mission_id = text(engineering?.state?.mission_id, 240) || null;
  node.persistence_state = persistenceState;
  node.persistence_confirmation_required = confirmationRequired;
  node.engineering_verified_complete = completion.complete === true;
  node.business_acceptance_verified = completion?.product_completion_criteria?.verified === true;
  node.base_commit = text(engineering?.state?.base_commit, 160) || null;
  node.cycle_status = text(cycle.status, 100) || null;

  portfolio.current_execution_key = node.execution_key;
  portfolio.status = portfolioStatusFromNode(node, "BLOCKED");
  portfolio.updated_at = new Date().toISOString();
  portfolio.business_progress = businessProgress(portfolio);
  portfolio.last_cycle_receipt = {
    node_id: node.node_id,
    execution_key: node.execution_key,
    mission_id: node.mission_id,
    cycle_status: node.cycle_status,
    engineering_verified_complete: node.engineering_verified_complete === true,
    business_acceptance_verified: node.business_acceptance_verified === true,
    persistence_state: node.persistence_state,
    persistence_confirmation_required: node.persistence_confirmation_required === true,
    persistent_source_changed: false,
    production_deployed: false,
    raw_source_included: false,
    raw_patch_included: false,
    raw_reasoning_included: false,
  };
  return portfolio;
}

export function completePortfolioNodeAfterVerifiedPersistence({
  portfolio: portfolioValue,
  executionKey,
  verifiedCommitSha,
} = {}) {
  const portfolio = structuredClone(object(portfolioValue));
  const node = activeNode(portfolio);
  const key = text(executionKey, 200);
  const commit = text(verifiedCommitSha, 160);
  if (!node) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ACTIVE_NODE_REQUIRED");
  if (!key || node.execution_key !== key) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_EXECUTION_KEY_MISMATCH");
  }
  if (!commit) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_VERIFIED_COMMIT_REQUIRED");

  node.status = "PERSISTED_VERIFIED";
  node.verified_commit_sha = commit;
  node.completed_at = new Date().toISOString();
  const historyEntry = safeHistoryEntry({
    ...node,
    candidate_signature: candidateSignature(node),
    completion_criteria_count: list(node.completion_criteria).length,
    verified_business_acceptance: node.business_acceptance_verified === true,
  });
  portfolio.completed_objectives = [
    ...list(portfolio.completed_objectives).map(safeHistoryEntry),
    historyEntry,
  ].slice(-MAX_HISTORY);
  portfolio.current_node_id = null;
  portfolio.current_execution_key = null;
  portfolio.status = "REASSESSING_VERIFIED_MAIN";
  portfolio.verified_commit_sha = commit;
  portfolio.updated_at = new Date().toISOString();
  portfolio.business_progress = businessProgress(portfolio);
  return portfolio;
}

export function compactProductEngineeringPortfolio(value = {}) {
  const source = object(value);
  if (!source.contract) return null;
  const roadmap = list(source.roadmap).slice(0, MAX_NODES).map((node) => ({
    node_id: text(node?.node_id, 180) || null,
    objective: text(node?.objective, 1800) || null,
    user_outcome: text(node?.user_outcome, 800) || null,
    rank: Number(node?.rank || 0),
    weighted_score: Number(node?.weighted_score || 0),
    status: text(node?.status, 120) || null,
    dependency_count: list(node?.dependencies).length,
    dependencies: list(node?.dependencies).slice(0, MAX_NODES),
    independent_evidence_scope: node?.independent_evidence_scope === true,
    execution_serialized_by_main_only: true,
    provisional_until_fresh_main_reassessment:
      node?.provisional_until_fresh_main_reassessment === true,
    completion_criteria_count: list(node?.completion_criteria).length,
    evidence_area_count: list(node?.evidence_areas).length,
    persistence_confirmation_required:
      node?.persistence_confirmation_required === true,
    engineering_verified_complete: node?.engineering_verified_complete === true,
    business_acceptance_verified: node?.business_acceptance_verified === true,
    execution_key: text(node?.execution_key, 200) || null,
    mission_id: text(node?.mission_id, 240) || null,
    verified_commit_sha: text(node?.verified_commit_sha, 160) || null,
  }));
  return {
    contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
    portfolio_id: text(source.portfolio_id, 180) || null,
    business_goal: text(source.business_goal, 2400) || null,
    repository_url: text(source.repository_url, 1000) || null,
    ref: "main",
    current_main_head: text(source.current_main_head, 160) || null,
    revision: Number(source.revision || 1),
    status: text(source.status, 120) || null,
    current_node_id: text(source.current_node_id, 180) || null,
    current_execution_key: text(source.current_execution_key, 200) || null,
    roadmap,
    completed_objective_count: list(source.completed_objectives).length,
    completed_objectives: list(source.completed_objectives).slice(-6).map((entry) => ({
      objective: text(entry?.objective, 1200) || null,
      verified_commit_sha: text(entry?.verified_commit_sha, 160) || null,
      verified_business_acceptance: entry?.verified_business_acceptance === true,
    })),
    business_progress: object(source.business_progress),
    anti_loop: object(source.anti_loop),
    executor_policy: object(source.executor_policy),
    current_main_is_authoritative: true,
    queued_objectives_are_provisional: true,
    raw_source_persisted: false,
    raw_patch_persisted: false,
    raw_reasoning_persisted: false,
    automatic_commit_allowed: false,
    automatic_deploy_allowed: false,
    authorization_effect: "NONE",
    updated_at: text(source.updated_at, 120) || null,
  };
}

export async function persistProductEngineeringPortfolio({
  context = {},
  portfolio,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const source = object(portfolio);
  if (!orgId) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ACTOR_REQUIRED");
  if (source.organization_id !== orgId || source.actor_id !== actor) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_SCOPE_MISMATCH");
  }
  const id = text(source.portfolio_id, 180);
  if (!id) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ID_REQUIRED");
  const now = new Date().toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: orgId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey(actor, id),
      memory_type: "fact",
      subject: "Product Engineering Portfolio Control State",
      content: `Portfolio ${id} status ${text(source.status, 120) || "unknown"}.`,
      importance: 0.03,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
        actor_id: actor,
        portfolio_id: id,
        portfolio: source,
        ordinary_memory_recall: false,
        reusable_platform_knowledge: false,
        automatic_knowledge_promotion: false,
        raw_source_persisted: false,
        raw_patch_persisted: false,
        raw_reasoning_persisted: false,
        authorization_effect: "NONE",
      },
      updated_at: now,
    }, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,updated_at")
    .single();
  if (result.error) throw result.error;
  return {
    persisted: Boolean(result.data?.id),
    row_id: result.data?.id || null,
    updated_at: result.data?.updated_at || now,
    portfolio: compactProductEngineeringPortfolio(source),
  };
}

export async function loadProductEngineeringPortfolio({
  context = {},
  portfolioId: requestedPortfolioId,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const id = text(requestedPortfolioId, 180);
  if (!orgId) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ACTOR_REQUIRED");
  if (!id) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_ID_REQUIRED");
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor, id))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { found: false, portfolio: null };
  const metadata = object(result.data.metadata);
  if (text(metadata.actor_id, 160) !== actor || text(metadata.portfolio_id, 180) !== id) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_SCOPE_MISMATCH");
  }
  return {
    found: true,
    row_id: result.data.id,
    updated_at: result.data.updated_at || null,
    portfolio: object(metadata.portfolio),
  };
}

export async function loadLatestProductEngineeringPortfolio({ context = {} } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId || !actor) return { found: false, portfolio: null };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .contains("metadata", { actor_id: actor })
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { found: false, portfolio: null };
  const metadata = object(result.data.metadata);
  if (text(metadata.actor_id, 160) !== actor) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_SCOPE_MISMATCH");
  }
  return {
    found: true,
    row_id: result.data.id,
    updated_at: result.data.updated_at || null,
    portfolio: object(metadata.portfolio),
  };
}

export const AvantiqoProductEngineeringPortfolioRuntime = Object.freeze({
  contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
  build: buildProductEngineeringPortfolio,
  attachCycleResult: attachProductEngineeringCycleResult,
  completeAfterVerifiedPersistence: completePortfolioNodeAfterVerifiedPersistence,
  compact: compactProductEngineeringPortfolio,
  persist: persistProductEngineeringPortfolio,
  load: loadProductEngineeringPortfolio,
  loadLatest: loadLatestProductEngineeringPortfolio,
  maximum_active_engineering_cycles: 1,
  parallel_code_execution_allowed: false,
  main_only: true,
  branch_or_worktree_fanout_allowed: false,
  fresh_main_reranking_required: true,
  automatic_commit_allowed: false,
  automatic_deploy_allowed: false,
  automatic_knowledge_promotion: false,
  authorization_effect: "NONE",
});

export default AvantiqoProductEngineeringPortfolioRuntime;
