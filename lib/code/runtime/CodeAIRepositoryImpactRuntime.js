export const CODE_AI_REPOSITORY_IMPACT_CONTRACT =
  "AVANTIQO_CODE_AI_REPOSITORY_IMPACT_V1";

const MAX_PATHS = 80;
const MAX_SURFACES = 24;

const TEST_PATH = /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;
const API_PATH = /(^|\/)(?:app\/api|api|routes?|controllers?|handlers?|rpc)(\/|$)/i;
const SECURITY_PATH = /(^|\/)(?:auth|authentication|authorization|security|permissions?|rbac)(\/|$)/i;
const DATA_PATH = /(^|\/)(?:supabase|migrations?|schema|database|db|models?|repositories?)(\/|$)/i;
const CONFIG_PATH = /(^|\/)(?:\.github\/workflows|config|infra|infrastructure|terraform|k8s|kubernetes)(\/|$)|(?:^|\/)(?:package\.json|tsconfig\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/i;
const RUNTIME_PATH = /(^|\/)(?:runtime|services?|workers?|providers?|engines?)(\/|$)/i;
const UI_PATH = /(^|\/)(?:app|components?|ui|pages?|views?|screens?)(\/|$)/i;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}

function pathFromSearchMatch(value) {
  const candidate = text(value, 2000);
  const match = candidate.match(/^([^:\n]+(?:\/[^:\n]+)*):\d+:/);
  if (match) return text(match[1], 1200);
  if (/^[A-Za-z0-9_.@+/-]+\.[A-Za-z0-9]{1,12}$/.test(candidate)) return candidate;
  return null;
}

function surfaceForPath(filePath) {
  const parts = text(filePath, 1200).split("/").filter(Boolean);
  if (!parts.length) return "(root)";
  if (parts.length === 1) return "(root)";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || parts[0];
}

function classifyPath(filePath) {
  const categories = [];
  if (TEST_PATH.test(filePath)) categories.push("test");
  if (API_PATH.test(filePath)) categories.push("api_contract");
  if (SECURITY_PATH.test(filePath)) categories.push("security");
  if (DATA_PATH.test(filePath)) categories.push("data_schema");
  if (CONFIG_PATH.test(filePath)) categories.push("config_infrastructure");
  if (RUNTIME_PATH.test(filePath)) categories.push("runtime_service");
  if (UI_PATH.test(filePath)) categories.push("ui_product");
  if (!categories.length) categories.push("source");
  return categories;
}

function impactRisk({ paths, categories, surfaces }) {
  if (categories.includes("security") || categories.includes("data_schema")) return "critical";
  if (
    categories.includes("api_contract") ||
    categories.includes("config_infrastructure") ||
    surfaces.length >= 5 ||
    paths.length >= 20
  ) return "high";
  if (paths.length || surfaces.length) return "standard";
  return "unknown";
}

function searchEvidencePaths(state) {
  const paths = [];
  const queries = [];
  for (const entry of list(state?.evidence)) {
    if (text(entry?.kind, 120) !== "operation") continue;
    if (text(entry?.status, 80) !== "completed") continue;
    if (text(entry?.action, 80) !== "search") continue;
    const result = object(entry.result);
    const query = text(result.query, 500);
    if (query) queries.push(query);
    for (const match of list(result.matches)) {
      const filePath = pathFromSearchMatch(match);
      if (filePath) paths.push(filePath);
    }
  }
  return {
    queries: unique(queries),
    paths: unique(paths),
  };
}

function readEvidencePaths(state) {
  const paths = [];
  for (const entry of list(state?.evidence)) {
    if (text(entry?.kind, 120) !== "operation") continue;
    if (text(entry?.status, 80) !== "completed") continue;
    if (text(entry?.action, 80) !== "read") continue;
    const filePath = text(entry?.result?.file_path || entry?.result?.path, 1200);
    if (filePath) paths.push(filePath);
  }
  return unique(paths);
}

export function deriveCodeAIRepositoryImpact(state = {}) {
  const searched = searchEvidencePaths(state);
  const seeded = unique([
    ...readEvidencePaths(state),
    ...list(state?.employee_fast_start?.seed_paths),
  ]);
  const changed = unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((item) => item?.path),
  ]);
  const paths = unique([...changed, ...seeded, ...searched.paths]).slice(0, MAX_PATHS);
  const testPaths = paths.filter((filePath) => TEST_PATH.test(filePath));
  const nonTestPaths = paths.filter((filePath) => !TEST_PATH.test(filePath));
  const categories = unique(paths.flatMap(classifyPath));
  const surfaces = unique(paths.map(surfaceForPath)).slice(0, MAX_SURFACES);
  const crossSurface = surfaces.length > 1;
  const risk = impactRisk({ paths, categories, surfaces });

  return {
    contract: CODE_AI_REPOSITORY_IMPACT_CONTRACT,
    evidence_backed: paths.length > 0,
    risk,
    observed_path_count: paths.length,
    observed_paths: paths,
    likely_test_paths: testPaths.slice(0, 30),
    likely_non_test_consumers: nonTestPaths.slice(0, 50),
    observed_surfaces: surfaces,
    cross_surface_impact: crossSurface,
    impact_categories: categories,
    search_queries_used: searched.queries.slice(0, 12),
    direct_seed_paths: seeded.slice(0, 12),
    current_changed_paths: changed.slice(0, 40),
    requires_contract_attention:
      categories.includes("api_contract") || categories.includes("security") || categories.includes("data_schema"),
    requires_test_attention: testPaths.length > 0,
    requires_cross_surface_review: crossSurface && nonTestPaths.length > 1,
    model_call_performed: false,
    provider_call_performed: false,
    repository_call_performed: false,
    authorization_effect: "NONE",
  };
}

export function formatCodeAIRepositoryImpactForObjective(value = {}) {
  const impact = object(value);
  if (impact.evidence_backed !== true) return null;
  return [
    "DETERMINISTIC REPOSITORY IMPACT MAP (EVIDENCE, NOT AUTHORIZATION):",
    `risk=${text(impact.risk, 80)}; observed_paths=${Number(impact.observed_path_count || 0)}; cross_surface=${impact.cross_surface_impact === true}`,
    `categories=${list(impact.impact_categories).join(",") || "none"}`,
    `surfaces=${list(impact.observed_surfaces).join(",") || "none"}`,
    list(impact.direct_seed_paths).length
      ? `direct_targets=${list(impact.direct_seed_paths).slice(0, 10).join(",")}`
      : null,
    list(impact.likely_non_test_consumers).length
      ? `observed_consumers=${list(impact.likely_non_test_consumers).slice(0, 20).join(",")}`
      : null,
    list(impact.likely_test_paths).length
      ? `observed_tests=${list(impact.likely_test_paths).slice(0, 15).join(",")}`
      : null,
    "Use this map to challenge narrow edits and choose verification scope. It is bounded search/read evidence and may be incomplete; inspect further when correctness depends on an unobserved edge.",
  ].filter(Boolean).join("\n");
}

export const CodeAIRepositoryImpactRuntime = Object.freeze({
  contract: CODE_AI_REPOSITORY_IMPACT_CONTRACT,
  derive: deriveCodeAIRepositoryImpact,
  formatForObjective: formatCodeAIRepositoryImpactForObjective,
});

export default CodeAIRepositoryImpactRuntime;