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
const DYNAMIC_EVIDENCE_BEFORE_LINES = 80;
const DYNAMIC_EVIDENCE_AFTER_LINES = 140;
const PLANNED_EVIDENCE_ALLOWED_PATHS = Object.freeze([
  "lib/intelligence",
  "lib/operator",
  "lib/platform",
  "lib/code",
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
    "Plan at most six high-information literal source-code searches that can expose implementation evidence relevant to the highest-leverage Product Autonomy gaps.",
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

function parsedSearchMatch(value) {
  const match = String(value ?? "").match(/^(.+?):(\d+):(.*)$/s);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  const filePath = text(match[1], 1000);
  if (!filePath.startsWith("lib/")) return null;
  return {
    file_path: filePath,
    line,
    excerpt: text(match[3], 1200),
  };
}

function implementationPathScore(filePath) {
  if (filePath.startsWith("lib/intelligence/runtime/")) return 9;
  if (filePath.startsWith("lib/operator/runtime/")) return 8;
  if (filePath.startsWith("lib/platform/capabilities/")) return 8;
  if (filePath.startsWith("lib/code/runtime/")) return 7;
  if (filePath.startsWith("lib/platform/runtime/")) return 6;
  if (filePath.startsWith("lib/operator/governance/")) return 6;
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
    candidate_count: candidates.length,
    files,
    bounded: true,
    read_only: true,
    authorization_effect: "NONE",
  };
}

function assessmentSystem() {
  return [
    "You are Avantiqo's owned Product Owner and Architecture Intelligence assessing ACTUAL checked-out GitHub main source evidence.",
    "The repository evidence comes from a fresh read-only Code AI workspace clone. The reported current_main_head is repository evidence; do not replace it with assumptions from the running application process.",
    "The snapshot contains fixed constitutional/runtime evidence, deterministic searches, a bounded owned-intelligence evidence query plan, and a bounded dynamic_evidence_expansion that follows high-signal current-main search hits into actual implementation files.",
    "Treat planned search queries as hypotheses only. Only their actual current-main matches and the surrounding source reads count as implementation evidence.",
    "Use the expanded implementation evidence to avoid choosing objectives from audit/process files alone.",
    "Assess only what the bounded evidence proves. This is still not a full repository certification: files not supplied may contain additional implementation or constraints.",
    "Use the permanent Product Constitution as authority and repository evidence as current implementation evidence.",
    "Prefer concrete autonomy gaps supported by implementation evidence. TODO/FIXME text is only a discovery signal and must not become an objective unless surrounding source evidence proves it matters.",
    "Choose exactly one next bounded engineering objective with the highest leverage for Avantiqo autonomy. The objective must instruct Code AI to inspect the newest main itself before editing, preserve concurrent changes, verify locally, repair failures, and stop only on evidence-based completion.",
    "If the supplied verified_commit_sha differs from current_main_head, treat that as normal concurrent progress. Base the next objective on current_main_head and explicitly note that main advanced after the verified commit.",
    "Never authorize a commit, deployment, migration, publication, secret access, force push, destructive operation, or recursive autonomous loop.",
    "Return exactly one JSON object with keys: status, executive_summary, repository_observations, gaps, engineering_objective, completion_criteria, evidence_limits.",
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
      evidence_files: files,
      evidence_query_plan: evidenceQueryPlan,
      evidence_searches: searches,
      dynamic_evidence_expansion: dynamicEvidenceExpansion,
      requested_focus: text(focus, 2000) || null,
      bounded_repository_evidence: true,
      dynamic_repository_evidence: true,
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
        repository_evidence_query_planner_attempted: true,
        raw_reasoning_persisted: false,
      },
      mode: "deep",
      critique_instructions: [
        "Reject claims about files or behavior absent from supplied repository evidence.",
        "Treat owned-intelligence planned queries as hypotheses only; require actual search matches and surrounding implementation reads before using them as evidence.",
        "Prefer gaps supported by dynamic implementation evidence over audit-only or process-only observations.",
        "Treat TODO/FIXME as discovery hints only; require surrounding implementation evidence before elevating one into the engineering objective.",
        "Make the engineering objective bounded and require Code AI to inspect current main again before edits because main may move after this assessment.",
        "Do not mistake this bounded source snapshot for build, test, end-to-end, provider, deployment or certification evidence.",
        "Do not authorize persistence or recursive execution.",
      ].join(" "),
      max_output_tokens: 1800,
    });

    return {
      contract: AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
      status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
      repository_snapshot: snapshot,
      assessment: object(result.parsed),
      next_engineering_handoff: {
        capability_key: "platform.product_engineering_cycle.execute",
        focus: text(result.parsed?.engineering_objective, 4000) || null,
        repository_url: snapshot.repository_url,
        ref: snapshot.ref,
        repository_head_observed: currentHead,
        repository_evidence_expanded: true,
        repository_evidence_query_planner_attempted: true,
        automatic_execution_started: false,
        authorization_effect: "NONE",
      },
      evidence_limits: [
        "Repository checkout evidence is not build evidence.",
        "Repository checkout evidence is not end-to-end evidence.",
        "Owned-intelligence search planning has no authority and planned queries are not evidence until current-main search matches and surrounding source reads support them.",
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
