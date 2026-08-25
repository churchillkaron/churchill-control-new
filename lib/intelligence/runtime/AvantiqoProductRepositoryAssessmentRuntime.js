import {
  CodeWorkspaceSandboxRuntime,
} from "@/lib/code/runtime/CodeWorkspaceSandboxRuntime";
import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  AVANTIQO_PRODUCT_CONSTITUTION,
} from "@/lib/intelligence/runtime/AvantiqoProductConstitution";

export const AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT =
  "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1";

const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";
const MAX_DYNAMIC_EVIDENCE_FILES = 8;
const MAX_PLANNED_EVIDENCE_SEARCHES = 6;
const MAX_OBJECTIVE_CANDIDATES = 4;
const MAX_OBJECTIVE_COMPLETION_CRITERIA = 6;
const DYNAMIC_EVIDENCE_BEFORE_LINES = 80;
const DYNAMIC_EVIDENCE_AFTER_LINES = 140;
const OBJECTIVE_RANKING_WEIGHTS = Object.freeze({
  autonomy_leverage: 3,
  product_outcome: 3,
  architecture_alignment: 2,
  evidence_strength: 3,
  boundedness: 1,
  verification_clarity: 2,
});
const PLANNED_EVIDENCE_ALLOWED_PATHS = Object.freeze([
  "lib/intelligence",
  "lib/operator",
  "lib/platform",
  "lib/code",
  "app",
  "components",
  "services",
  "scripts",
  "tests",
  "supabase/migrations",
]);
const DYNAMIC_EVIDENCE_ALLOWED_PREFIXES = Object.freeze([
  "lib/",
  "app/",
  "components/",
  "services/",
  "scripts/",
  "tests/",
  "supabase/migrations/",
]);
const DYNAMIC_EVIDENCE_ALLOWED_EXTENSIONS = Object.freeze([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sql",
  ".json",
  ".md",
]);
const EVIDENCE_FILES = [
  ["AGENTS.md", 1, 420],
  ["package.json", 1, 180],
  ["lib/platform/runtime/PlatformDomainRuntime.js", 1, 420],
  ["lib/intelligence/runtime/AvantiqoProductConstitution.js", 1, 520],
  ["lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js", 1, 420],
  ["scripts/operator-intelligence-autonomy-v2-audit.mjs", 1, 520],
];
const EVIDENCE_SEARCHES = [
  ["platform.product_engineering_cycle.execute", ["lib"]],
  ["platform.product_persistence_handoff.execute", ["lib"]],
  ["platform.product_autonomy_continuation.assess", ["lib"]],
  ["platform.code_ai_autonomous.execute", ["lib"]],
  ["platform.code_ai_commit.execute", ["lib"]],
  ["STALE_BASE_REPLAN_REQUIRED", ["lib"]],
  ["TODO", ["lib/intelligence", "lib/operator", "lib/platform", "lib/code"]],
  ["FIXME", ["lib/intelligence", "lib/operator", "lib/platform", "lib/code"]],
];

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(5, Math.round(score)));
}

async function readEvidenceFile(workspace, [filePath, startLine, endLine]) {
  try {
    const result = await workspace.read({
      file_path: filePath,
      start_line: startLine,
      end_line: endLine,
    });
    return {
      file_path: filePath,
      found: true,
      start_line: result.start_line,
      end_line: result.end_line,
      total_lines: result.total_lines,
      content: text(result.content, 30000),
    };
  } catch (error) {
    return {
      file_path: filePath,
      found: false,
      error: text(error?.message, 500) || "REPOSITORY_EVIDENCE_READ_FAILED",
    };
  }
}

async function searchEvidence(
  workspace,
  query,
  paths = [],
  source = "deterministic",
) {
  try {
    const result = await workspace.search({ query, paths });
    return {
      query,
      paths: list(paths),
      source,
      match_count: Number(result.match_count || 0),
      truncated: result.truncated === true,
      matches: list(result.matches).slice(0, 80),
    };
  } catch (error) {
    return {
      query,
      paths: list(paths),
      source,
      match_count: 0,
      truncated: false,
      matches: [],
      error: text(error?.message, 500) || "REPOSITORY_EVIDENCE_SEARCH_FAILED",
    };
  }
}

function evidencePlanningSystem() {
  return [
    "You are Avantiqo's owned repository evidence planner.",
    "You do not choose the engineering objective and you do not execute any action.",
    "Plan at most six high-information literal source-code searches that can expose implementation evidence relevant to the highest-leverage Product Autonomy gaps across runtime logic, APIs, UI surfaces, workers, tests and database migrations.",
    "Queries must be literal strings likely to exist in source code: symbols, contract names, error codes, capability keys or behavior markers. Do not return broad natural-language questions.",
    `Every search path must be one of: ${PLANNED_EVIDENCE_ALLOWED_PATHS.join(", ")}.`,
    "Do not search environment files, credentials, secret values, generated assets, dependencies or external content.",
    "The plan has no authorization effect. It is only input to bounded read-only repository search.",
    "Return exactly one JSON object with keys: search_queries, rationale, evidence_limits.",
    "search_queries must be an array of objects with keys query, paths and reason.",
  ].join("\n");
}

function normalizedPlannedEvidenceQueries(value) {
  const allowedPaths = new Set(PLANNED_EVIDENCE_ALLOWED_PATHS);
  const deterministicQueries = new Set(
    EVIDENCE_SEARCHES.map(([query]) => text(query, 200).toLowerCase()),
  );
  const seen = new Set();
  const normalized = [];

  for (const item of list(object(value).search_queries)) {
    if (normalized.length >= MAX_PLANNED_EVIDENCE_SEARCHES) break;
    const query = text(item?.query, 160).replace(/\s+/g, " ");
    if (!query || query.length < 2 || deterministicQueries.has(query.toLowerCase())) {
      continue;
    }
    const paths = [...new Set(
      list(item?.paths)
        .map((path) => text(path, 120))
        .filter((path) => allowedPaths.has(path)),
    )].slice(0, PLANNED_EVIDENCE_ALLOWED_PATHS.length);
    if (!paths.length) continue;
    const key = `${query.toLowerCase()}|${[...paths].sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      query,
      paths,
      reason: text(item?.reason, 500) || null,
    });
  }

  return normalized;
}

async function planRepositoryEvidenceQueries({
  organizationId,
  context,
  repository,
  currentHead,
  files,
  focus,
}) {
  try {
    const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
      organization_id: organizationId,
      party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
      entity_id: text(context.entityId || context.entity_id, 160) || null,
      system: evidencePlanningSystem(),
      messages: [{
        role: "user",
        content: JSON.stringify({
          contract: "AVANTIQO_PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_V1",
          constitution: AVANTIQO_PRODUCT_CONSTITUTION,
          repository: {
            current_main_head: currentHead,
            tracked_file_count: Number(repository.tracked_file_count || 0),
            tracked_files_sample: list(repository.tracked_files_sample).slice(0, 200),
            tracked_files_sample_strategy:
              text(repository.tracked_files_sample_strategy, 160) || null,
            tracked_file_inventory: object(repository.tracked_file_inventory),
          },
          requested_focus: text(focus, 2000) || null,
          deterministic_searches: EVIDENCE_SEARCHES.map(([query, paths]) => ({
            query,
            paths,
          })),
          fixed_evidence: files
            .filter((file) => file?.found === true)
            .map((file) => ({
              file_path: file.file_path,
              total_lines: file.total_lines,
              content_excerpt: text(file.content, 2400),
            })),
        }),
      }],
      tools: [],
      authorization: { allow_mutating_tools: false },
      metadata: {
        module: "INTELLIGENCE",
        operation: "PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN",
        repository_head: currentHead,
        repository_evidence_read_only: true,
        query_plan_only: true,
        raw_reasoning_persisted: false,
      },
      mode: "fast",
      max_output_tokens: 900,
    });
    const queries = normalizedPlannedEvidenceQueries(result.parsed);
    return {
      contract: "AVANTIQO_PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_V1",
      status: queries.length ? "PLANNED" : "NO_ADDITIONAL_QUERIES",
      planner: "AVANTIQO_OWNED_INTELLIGENCE",
      maximum_queries: MAX_PLANNED_EVIDENCE_SEARCHES,
      allowed_paths: [...PLANNED_EVIDENCE_ALLOWED_PATHS],
      queries,
      rationale: text(result.parsed?.rationale, 1200) || null,
      fallback_deterministic_searches_preserved: true,
      read_only: true,
      authorization_effect: "NONE",
    };
  } catch (error) {
    return {
      contract: "AVANTIQO_PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_V1",
      status: "FALLBACK_DETERMINISTIC",
      planner: "AVANTIQO_OWNED_INTELLIGENCE",
      maximum_queries: MAX_PLANNED_EVIDENCE_SEARCHES,
      allowed_paths: [...PLANNED_EVIDENCE_ALLOWED_PATHS],
      queries: [],
      error: text(error?.message, 500) || "REPOSITORY_EVIDENCE_QUERY_PLAN_FAILED",
      fallback_deterministic_searches_preserved: true,
      read_only: true,
      authorization_effect: "NONE",
    };
  }
}

function isAllowedDynamicEvidencePath(filePath) {
  const normalized = text(filePath, 1000).replaceAll("\\", "/");
  if (!normalized || normalized.includes("/../") || normalized.startsWith("../")) {
    return false;
  }
  if (
    normalized.startsWith(".env") ||
    normalized.includes("/.env") ||
    normalized.includes("/node_modules/") ||
    normalized.includes("/.next/") ||
    normalized.includes("/.git/")
  ) {
    return false;
  }
  if (!DYNAMIC_EVIDENCE_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  return DYNAMIC_EVIDENCE_ALLOWED_EXTENSIONS.some((extension) =>
    normalized.toLowerCase().endsWith(extension),
  );
}

function parsedSearchMatch(value) {
  const match = String(value ?? "").match(/^(.+?):(\d+):(.*)$/s);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  const filePath = text(match[1], 1000);
  if (!isAllowedDynamicEvidencePath(filePath)) return null;
  return {
    file_path: filePath,
    line,
    excerpt: text(match[3], 1200),
  };
}

function implementationPathScore(filePath) {
  if (filePath.startsWith("lib/intelligence/runtime/")) return 10;
  if (filePath.startsWith("lib/operator/runtime/")) return 9;
  if (filePath.startsWith("lib/platform/capabilities/")) return 9;
  if (filePath.startsWith("app/api/")) return 8;
  if (filePath.startsWith("services/")) return 8;
  if (filePath.startsWith("lib/code/runtime/")) return 8;
  if (filePath.startsWith("supabase/migrations/")) return 7;
  if (filePath.startsWith("lib/platform/runtime/")) return 7;
  if (filePath.startsWith("lib/operator/governance/")) return 7;
  if (filePath.startsWith("app/")) return 6;
  if (filePath.startsWith("components/")) return 6;
  if (filePath.startsWith("tests/")) return 5;
  if (filePath.startsWith("scripts/")) return 4;
  return 3;
}

function dynamicEvidenceCandidates(searches) {
  const staticPaths = new Set(EVIDENCE_FILES.map(([filePath]) => filePath));
  const candidates = new Map();

  for (const search of searches) {
    const query = text(search?.query, 500);
    const issueWeight = ["TODO", "FIXME"].includes(query)
      ? 4
      : search?.source === "owned_intelligence_planner"
        ? 3
        : 2;
    for (const rawMatch of list(search?.matches)) {
      const parsed = parsedSearchMatch(rawMatch);
      if (!parsed || staticPaths.has(parsed.file_path)) continue;
      const existing = candidates.get(parsed.file_path) || {
        file_path: parsed.file_path,
        first_match_line: parsed.line,
        match_count: 0,
        score: implementationPathScore(parsed.file_path),
        discovery_queries: new Set(),
        discovery_sources: new Set(),
        excerpts: [],
      };
      existing.first_match_line = Math.min(existing.first_match_line, parsed.line);
      existing.match_count += 1;
      existing.score += issueWeight;
      existing.discovery_queries.add(query);
      existing.discovery_sources.add(text(search?.source, 120) || "deterministic");
      if (existing.excerpts.length < 4 && parsed.excerpt) {
        existing.excerpts.push({ line: parsed.line, excerpt: parsed.excerpt });
      }
      candidates.set(parsed.file_path, existing);
    }
  }

  return [...candidates.values()]
    .sort((left, right) =>
      right.score - left.score ||
      right.discovery_queries.size - left.discovery_queries.size ||
      right.match_count - left.match_count ||
      left.file_path.localeCompare(right.file_path),
    )
    .slice(0, MAX_DYNAMIC_EVIDENCE_FILES)
    .map((candidate) => ({
      ...candidate,
      discovery_queries: [...candidate.discovery_queries],
      discovery_sources: [...candidate.discovery_sources],
    }));
}

async function readDynamicEvidenceFile(workspace, candidate) {
  const firstMatchLine = Number(candidate?.first_match_line || 1);
  const startLine = Math.max(1, firstMatchLine - DYNAMIC_EVIDENCE_BEFORE_LINES);
  const endLine = firstMatchLine + DYNAMIC_EVIDENCE_AFTER_LINES;
  try {
    const result = await workspace.read({
      file_path: candidate.file_path,
      start_line: startLine,
      end_line: endLine,
    });
    return {
      file_path: candidate.file_path,
      found: true,
      discovery_queries: list(candidate.discovery_queries),
      discovery_sources: list(candidate.discovery_sources),
      discovery_match_count: Number(candidate.match_count || 0),
      discovery_score: Number(candidate.score || 0),
      discovery_excerpts: list(candidate.excerpts),
      start_line: result.start_line,
      end_line: result.end_line,
      total_lines: result.total_lines,
      content: text(result.content, 12000),
    };
  } catch (error) {
    return {
      file_path: candidate.file_path,
      found: false,
      discovery_queries: list(candidate.discovery_queries),
      discovery_sources: list(candidate.discovery_sources),
      discovery_match_count: Number(candidate.match_count || 0),
      discovery_score: Number(candidate.score || 0),
      discovery_excerpts: list(candidate.excerpts),
      error: text(error?.message, 500) || "REPOSITORY_DYNAMIC_EVIDENCE_READ_FAILED",
    };
  }
}

async function expandDynamicEvidence(workspace, searches) {
  const candidates = dynamicEvidenceCandidates(searches);
  const files = await Promise.all(
    candidates.map((candidate) => readDynamicEvidenceFile(workspace, candidate)),
  );
  return {
    method: "CURRENT_MAIN_SEARCH_DISCOVERED_IMPLEMENTATION_READS",
    maximum_files: MAX_DYNAMIC_EVIDENCE_FILES,
    allowed_prefixes: [...DYNAMIC_EVIDENCE_ALLOWED_PREFIXES],
    allowed_extensions: [...DYNAMIC_EVIDENCE_ALLOWED_EXTENSIONS],
    candidate_count: candidates.length,
    files,
    bounded: true,
    read_only: true,
    authorization_effect: "NONE",
  };
}

function candidateEvidenceStrength(evidencePaths, dynamicPaths) {
  const dynamicCount = evidencePaths.filter((filePath) => dynamicPaths.has(filePath)).length;
  if (dynamicCount >= 2) return 5;
  if (dynamicCount === 1 && evidencePaths.length >= 2) return 5;
  if (dynamicCount === 1) return 4;
  if (evidencePaths.length >= 3) return 4;
  if (evidencePaths.length >= 2) return 3;
  return evidencePaths.length === 1 ? 2 : 0;
}

function objectiveEvidenceSets(files, dynamicEvidenceExpansion) {
  const fixedPaths = new Set(
    files
      .filter((file) => file?.found === true)
      .map((file) => text(file.file_path, 1000))
      .filter(Boolean),
  );
  const dynamicPaths = new Set(
    list(dynamicEvidenceExpansion?.files)
      .filter((file) => file?.found === true)
      .map((file) => text(file.file_path, 1000))
      .filter(Boolean),
  );
  return {
    observedPaths: new Set([...fixedPaths, ...dynamicPaths]),
    dynamicPaths,
  };
}

function normalizedObjectiveCandidates(value, files, dynamicEvidenceExpansion) {
  const { observedPaths, dynamicPaths } = objectiveEvidenceSets(
    files,
    dynamicEvidenceExpansion,
  );
  const normalized = [];
  const seenObjectives = new Set();

  for (const [index, item] of list(object(value).objective_candidates)
    .slice(0, MAX_OBJECTIVE_CANDIDATES)
    .entries()) {
    const objective = text(item?.objective, 4000);
    const objectiveKey = objective.toLowerCase();
    if (!objective || seenObjectives.has(objectiveKey)) continue;

    const evidencePaths = [...new Set(
      list(item?.evidence_paths)
        .map((filePath) => text(filePath, 1000))
        .filter((filePath) => observedPaths.has(filePath)),
    )].slice(0, MAX_DYNAMIC_EVIDENCE_FILES + EVIDENCE_FILES.length);
    const completionCriteria = list(item?.completion_criteria)
      .map((criterion) => text(criterion, 700))
      .filter(Boolean)
      .slice(0, MAX_OBJECTIVE_COMPLETION_CRITERIA);
    if (!evidencePaths.length || !completionCriteria.length) continue;

    const proposedScores = object(item?.dimension_scores);
    const dimensionScores = {
      autonomy_leverage: boundedScore(proposedScores.autonomy_leverage),
      product_outcome: boundedScore(proposedScores.product_outcome),
      architecture_alignment: boundedScore(proposedScores.architecture_alignment),
      evidence_strength: candidateEvidenceStrength(evidencePaths, dynamicPaths),
      boundedness: boundedScore(proposedScores.boundedness),
      verification_clarity: boundedScore(proposedScores.verification_clarity),
    };
    const weightedScore = Object.entries(OBJECTIVE_RANKING_WEIGHTS)
      .reduce((total, [dimension, weight]) =>
        total + Number(weight) * Number(dimensionScores[dimension] || 0), 0);

    seenObjectives.add(objectiveKey);
    normalized.push({
      id: text(item?.id, 120) || `candidate_${index + 1}`,
      objective,
      evidence_paths: evidencePaths,
      rationale: text(item?.rationale, 1600) || null,
      user_outcome: text(item?.user_outcome, 1200) || null,
      completion_criteria: completionCriteria,
      dimension_scores: dimensionScores,
      weighted_score: weightedScore,
      ranking_policy: "CONSTITUTION_WEIGHTED_EVIDENCE_BACKED_V1",
    });
  }

  return normalized.sort((left, right) =>
    right.weighted_score - left.weighted_score ||
    right.dimension_scores.evidence_strength - left.dimension_scores.evidence_strength ||
    right.evidence_paths.length - left.evidence_paths.length ||
    left.id.localeCompare(right.id),
  );
}

function objectiveSelectionFromAssessment({
  assessment,
  files,
  dynamicEvidenceExpansion,
  currentHead,
}) {
  const rankedCandidates = normalizedObjectiveCandidates(
    assessment,
    files,
    dynamicEvidenceExpansion,
  );
  const selected = rankedCandidates[0] || null;
  if (!selected?.objective) {
    throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_EVIDENCE_BACKED_OBJECTIVE_REQUIRED");
  }
  return {
    contract: "AVANTIQO_PRODUCT_ENGINEERING_OBJECTIVE_SELECTION_V1",
    policy: "DETERMINISTIC_CONSTITUTION_WEIGHTED_EVIDENCE_BACKED_RANKING",
    current_main_head: currentHead,
    maximum_candidates: MAX_OBJECTIVE_CANDIDATES,
    maximum_completion_criteria: MAX_OBJECTIVE_COMPLETION_CRITERIA,
    ranking_weights: { ...OBJECTIVE_RANKING_WEIGHTS },
    eligible_candidate_count: rankedCandidates.length,
    ranked_candidates: rankedCandidates,
    selected_candidate_id: selected.id,
    selected_objective: selected.objective,
    selected_evidence_paths: selected.evidence_paths,
    selected_completion_criteria: selected.completion_criteria,
    selected_weighted_score: selected.weighted_score,
    read_only: true,
    authorization_effect: "NONE",
  };
}

function assessmentSystem() {
  return [
    "You are Avantiqo's owned Product Owner and Architecture Intelligence assessing ACTUAL checked-out GitHub main source evidence.",
    "The repository evidence comes from a fresh read-only Code AI workspace clone. The reported current_main_head is repository evidence; do not replace it with assumptions from the running application process.",
    "The snapshot contains fixed constitutional/runtime evidence, deterministic searches, a bounded owned-intelligence evidence query plan, and a bounded dynamic_evidence_expansion that follows high-signal current-main search hits into approved tracked implementation areas including runtime libraries, APIs, UI components, owned workers, tests and database migrations.",
    "Treat planned search queries as hypotheses only. Only their actual current-main matches and the surrounding source reads count as implementation evidence.",
    "Use the expanded implementation evidence to avoid choosing objectives from audit/process files alone.",
    "Assess only what the bounded evidence proves. This is still not a full repository certification: files not supplied may contain additional implementation or constraints.",
    "Use the permanent Product Constitution as authority and repository evidence as current implementation evidence.",
    "Identify two to four distinct bounded engineering objective candidates when the evidence supports them. Do not select the winner yourself; Avantiqo's deterministic ranking policy selects from your eligible evidence-backed candidates.",
    "Every candidate must cite one or more exact evidence_paths that appear as successfully read repository_snapshot.evidence_files[].file_path or repository_snapshot.dynamic_evidence_expansion.files[].file_path. A search hit without a successful surrounding source read is not sufficient evidence.",
    "Each candidate must include id, objective, evidence_paths, rationale, user_outcome, completion_criteria, and dimension_scores.",
    "completion_criteria must contain one to six concrete evidence-verifiable acceptance criteria for the objective. These criteria become bounded engineering completion targets, not authorization.",
    "dimension_scores must contain integer 0-5 scores for autonomy_leverage, product_outcome, architecture_alignment, boundedness, and verification_clarity. Evidence strength is computed by owned runtime code and must not be supplied as authority by the model.",
    "Prefer concrete autonomy gaps supported by implementation evidence. TODO/FIXME text is only a discovery signal and must not become an objective unless surrounding source evidence proves it matters.",
    "Every objective must instruct Code AI to inspect the newest main itself before editing, preserve concurrent changes, verify locally, repair failures, and stop only on evidence-based completion.",
    "If the supplied verified_commit_sha differs from current_main_head, treat that as normal concurrent progress. Base all candidates on current_main_head and explicitly note that main advanced after the verified commit when relevant.",
    "Never authorize a commit, deployment, migration, publication, secret access, force push, destructive operation, or recursive autonomous loop.",
    "Return exactly one JSON object with keys: status, executive_summary, repository_observations, gaps, objective_candidates, evidence_limits.",
  ].join("\n");
}

export async function assessAvantiqoCurrentRepository({
  context = {},
  repositoryUrl = DEFAULT_REPOSITORY,
  ref = DEFAULT_REF,
  verifiedCommitSha = null,
  focus = null,
  timeoutMs = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) {
    throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_ORGANIZATION_REQUIRED");
  }

  const workspace = await CodeWorkspaceSandboxRuntime.open({
    repository_url: text(repositoryUrl, 500) || DEFAULT_REPOSITORY,
    ref: text(ref, 160) || DEFAULT_REF,
    ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
  });

  try {
    const repository = await workspace.inspect();
    if (!repository.clean) {
      throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_WORKSPACE_NOT_CLEAN");
    }
    const currentHead = text(repository.head_sha, 160);
    if (!currentHead) {
      throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_HEAD_REQUIRED");
    }
    const files = await Promise.all(
      EVIDENCE_FILES.map((entry) => readEvidenceFile(workspace, entry)),
    );
    const deterministicSearches = await Promise.all(
      EVIDENCE_SEARCHES.map(([query, paths]) =>
        searchEvidence(workspace, query, paths, "deterministic"),
      ),
    );
    const evidenceQueryPlan = await planRepositoryEvidenceQueries({
      organizationId,
      context,
      repository,
      currentHead,
      files,
      focus,
    });
    const plannedSearches = await Promise.all(
      evidenceQueryPlan.queries.map((item) =>
        searchEvidence(
          workspace,
          item.query,
          item.paths,
          "owned_intelligence_planner",
        ),
      ),
    );
    const searches = [...deterministicSearches, ...plannedSearches];
    const dynamicEvidenceExpansion = await expandDynamicEvidence(
      workspace,
      searches,
    );

    const verified = text(verifiedCommitSha, 160) || null;
    const snapshot = {
      generated_at: new Date().toISOString(),
      repository_url: text(repositoryUrl, 500) || DEFAULT_REPOSITORY,
      ref: text(ref, 160) || DEFAULT_REF,
      current_main_head: currentHead,
      verified_commit_sha: verified,
      verified_commit_is_current_head: verified ? verified === currentHead : null,
      main_advanced_after_verified_commit: verified ? verified !== currentHead : null,
      clean_checkout: repository.clean === true,
      package_manager: repository.package_manager || null,
      tracked_file_count: Number(repository.tracked_file_count || 0),
      tracked_files_sample: list(repository.tracked_files_sample).slice(0, 200),
      tracked_files_sample_strategy:
        text(repository.tracked_files_sample_strategy, 160) || null,
      tracked_file_inventory: object(repository.tracked_file_inventory),
      evidence_files: files,
      evidence_query_plan: evidenceQueryPlan,
      evidence_searches: searches,
      dynamic_evidence_expansion: dynamicEvidenceExpansion,
      requested_focus: text(focus, 2000) || null,
      bounded_repository_evidence: true,
      dynamic_repository_evidence: true,
      cross_surface_repository_evidence: true,
      repository_evidence_query_planner_attempted: true,
      intelligence_planned_repository_evidence:
        evidenceQueryPlan.queries.length > 0,
      full_repository_certification: false,
    };

    const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
      organization_id: organizationId,
      party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
      entity_id: text(context.entityId || context.entity_id, 160) || null,
      system: assessmentSystem(),
      messages: [{
        role: "user",
        content: JSON.stringify({
          contract: AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
          constitution: AVANTIQO_PRODUCT_CONSTITUTION,
          repository_snapshot: snapshot,
        }),
      }],
      tools: [],
      authorization: { allow_mutating_tools: false },
      metadata: {
        module: "INTELLIGENCE",
        operation: "PRODUCT_REPOSITORY_ASSESSMENT",
        product_repository_assessment_contract:
          AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
        repository_head: currentHead,
        assessment_only: true,
        repository_evidence_read_only: true,
        dynamic_repository_evidence: true,
        cross_surface_repository_evidence: true,
        objective_candidate_ranking:
          "DETERMINISTIC_CONSTITUTION_WEIGHTED_EVIDENCE_BACKED_RANKING",
        repository_evidence_query_planner_attempted: true,
        raw_reasoning_persisted: false,
      },
      mode: "deep",
      critique_instructions: [
        "Reject claims about files or behavior absent from supplied repository evidence.",
        "Treat owned-intelligence planned queries as hypotheses only; require actual search matches and surrounding implementation reads before using them as evidence.",
        "Reject objective candidates whose evidence_paths do not name successfully read files in the supplied repository snapshot.",
        "Prefer gaps supported by dynamic implementation evidence across runtime, API, UI, worker, test and database surfaces over audit-only or process-only observations.",
        "Treat TODO/FIXME as discovery hints only; require surrounding implementation evidence before elevating one into an objective candidate.",
        "Require one to six concrete completion criteria for every eligible objective candidate so the selected engineering target has a bounded definition of done.",
        "Make every candidate bounded and require Code AI to inspect current main again before edits because main may move after this assessment.",
        "Do not mistake this bounded source snapshot for build, test, end-to-end, provider, deployment or certification evidence.",
        "Do not authorize persistence or recursive execution.",
      ].join(" "),
      max_output_tokens: 2200,
    });

    const parsedAssessment = object(result.parsed);
    const objectiveSelection = objectiveSelectionFromAssessment({
      assessment: parsedAssessment,
      files,
      dynamicEvidenceExpansion,
      currentHead,
    });
    const selectedCandidate = objectiveSelection.ranked_candidates[0];
    const assessment = {
      ...parsedAssessment,
      objective_candidates: objectiveSelection.ranked_candidates,
      objective_selection: objectiveSelection,
      engineering_objective: selectedCandidate.objective,
      completion_criteria: selectedCandidate.completion_criteria,
    };

    return {
      contract: AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
      status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
      repository_snapshot: snapshot,
      assessment,
      objective_selection: objectiveSelection,
      next_engineering_handoff: {
        capability_key: "platform.product_engineering_cycle.execute",
        focus: selectedCandidate.objective,
        repository_url: snapshot.repository_url,
        ref: snapshot.ref,
        repository_head_observed: currentHead,
        repository_evidence_expanded: true,
        cross_surface_repository_evidence: true,
        repository_evidence_query_planner_attempted: true,
        objective_selection_contract: objectiveSelection.contract,
        selected_candidate_id: objectiveSelection.selected_candidate_id,
        selected_evidence_paths: objectiveSelection.selected_evidence_paths,
        objective_selection_score: objectiveSelection.selected_weighted_score,
        objective_selection_evidence_backed: true,
        automatic_execution_started: false,
        authorization_effect: "NONE",
      },
      evidence_limits: [
        "Repository checkout evidence is not build evidence.",
        "Repository checkout evidence is not end-to-end evidence.",
        "Owned-intelligence search planning has no authority and planned queries are not evidence until current-main search matches and surrounding source reads support them.",
        "Objective candidates are eligible only when they cite successfully read current-main evidence paths; deterministic ranking does not add authorization or prove runtime correctness.",
        "Selected completion criteria are bounded to six evidence-verifiable engineering targets and do not add authorization.",
        "Cross-surface dynamic evidence remains restricted to approved tracked source prefixes and source/document file types; it does not permit environment, dependency, generated-output or arbitrary repository reads.",
        "Dynamic evidence expansion is bounded search-discovered implementation context, not a complete source-code certification.",
        "The bounded evidence set is not a complete source-code certification.",
        "Main may advance again after this assessment; Code AI must refetch and re-inspect before edits.",
        "This read-only assessment does not authorize commit, deployment or migration execution.",
      ],
    };
  } finally {
    await workspace.stop();
  }
}

export default assessAvantiqoCurrentRepository;