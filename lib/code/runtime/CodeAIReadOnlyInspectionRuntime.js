import { CodeWorkspaceRuntime } from "./CodeWorkspaceRuntime.js";
import { publishAvantiqoLiveExecution } from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";

export const CODE_AI_READ_ONLY_INSPECTION_CONTRACT = "AVANTIQO_CODE_AI_READ_ONLY_INSPECTION_V1";
const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new.git";
const DOMAIN_TOKENS = ["finance", "operations", "supply-chain", "commercial", "people", "projects", "documents", "analytics", "creative", "administration", "compliance", "code", "business-partner"];
const MAX_FILES = 24;
const MAX_TESTS = 3;

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function title(value) { return text(value, 120).replaceAll("-", " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

function focusToken(message) {
  const input = text(message, 4000).toLowerCase();
  const exact = DOMAIN_TOKENS.find((token) => input.includes(token.replaceAll("-", " ")) || input.includes(token));
  return exact || "platform";
}

function filePriority(path) {
  const p = text(path, 1000).toLowerCase();
  let score = 0;
  if (p.includes("/page.")) score += 100;
  if (p.includes("/layout.")) score += 85;
  if (p.startsWith("components/")) score += 80;
  if (p.startsWith("lib/")) score += 60;
  if (p.startsWith("app/api/")) score += 45;
  if (p.startsWith("tests/")) score += 35;
  if (/ui|workspace|form|invoice|overview|navigation|shell|landing/.test(p)) score += 20;
  return score;
}

function sourceSignals(filePath, content) {
  const lines = String(content || "").split("\n");
  const findings = [];
  const patterns = [
    ["unfinished_marker", /\b(TODO|FIXME|NOT_IMPLEMENTED|not implemented)\b/i],
    ["mobile_width_risk", /(?:min-w-|w-)\[(?:[5-9]\d\d|\d{4,})px\]/i],
    ["horizontal_overflow_risk", /overflow-x-(?:scroll|auto)/i],
  ];
  for (let index = 0; index < lines.length; index += 1) {
    for (const [kind, pattern] of patterns) {
      if (pattern.test(lines[index])) {
        findings.push({ kind, file_path: filePath, line: index + 1, excerpt: text(lines[index], 220) });
      }
    }
  }
  return findings.slice(0, 8);
}

async function publish(context, event) {
  return publishAvantiqoLiveExecution({ context, event: {
    lane: "code",
    status: "running",
    read_only: true,
    mutation_possible: false,
    mutation_running: false,
    paid_execution_running: false,
    verification_running: false,
    ...event,
  }}).catch(() => null);
}

function testCandidates(paths, token) {
  const normalized = token.replaceAll("-", "[-_ ]?");
  const matcher = new RegExp(normalized, "i");
  const priority = (path) => {
    const value = path.toLowerCase();
    if (value.includes("ui-completion")) return 0;
    if (value.includes("worldclass")) return 1;
    if (value.includes("landing")) return 2;
    if (value.includes("workflow")) return 3;
    if (value.includes("workspace")) return 4;
    return 9;
  };
  return paths
    .filter((path) => path.startsWith("tests/") && matcher.test(path) && /(ui|workspace|workflow|landing|worldclass|completion)/i.test(path))
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))
    .slice(0, MAX_TESTS);
}

export async function runCodeAIReadOnlyInspection({ context = {}, message, repository_url = DEFAULT_REPOSITORY, ref = "main", workspace_target = null, timeout_ms = 120000 } = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) throw new Error("CODE_AI_READ_ONLY_INSPECTION_ORGANIZATION_REQUIRED");
  const focus = focusToken(message);
  const label = title(focus);
  await publish(context, { phase: "CODE_INSPECTION_OPEN", description: `Opening current main for read-only ${label} inspection.` });
  const workspace = await CodeWorkspaceRuntime.open({ repository_url, ref, timeout_ms, ...(workspace_target ? { workspace_target } : {}) });
  try {
    const repository = await workspace.inspect();
    await publish(context, { phase: "CODE_INSPECTION_SEARCH", description: `Searching current main for ${label} pages, components, APIs and tests.` });
    const groups = [
      ["pages", [`app/**/${focus}/**`, `app/**/*${focus}*/**`]],
      ["components", [`components/**/${focus}/**`, `components/**/*${focus}*`]],
      ["library", [`lib/${focus}/**`, `lib/**/*${focus}*`]],
      ["api", [`app/api/${focus}/**`, `app/api/**/*${focus}*`]],
      ["tests", [`tests/*${focus}*`, `tests/**/*${focus}*`]],
    ];
    const groupedPaths = [];
    for (const [group, pathspecs] of groups) {
      await publish(context, { phase: "CODE_INSPECTION_SEARCH", action: "search", description: `Searching ${group} for ${label} source.` });
      const inventory = await workspace.run({ command: "git", args: ["ls-files", "--", ...pathspecs], timeout_ms });
      if (Number(inventory.exit_code) !== 0) {
        throw new Error(`CODE_AI_READ_ONLY_INVENTORY_FAILED:${group}:${inventory.exit_code}`);
      }
      const groupLimit = group === "tests" ? 120 : 40;
      groupedPaths.push(...String(inventory.stdout || "").split("\n").map((item) => text(item, 1000)).filter(Boolean).slice(0, groupLimit));
    }
    const paths = unique(groupedPaths);
    const selected = [...paths].sort((a, b) => filePriority(b) - filePriority(a) || a.localeCompare(b)).slice(0, MAX_FILES);
    const evidenceFiles = [];
    const findings = [];
    for (const filePath of selected) {
      await publish(context, { phase: "CODE_FILE_READ", action: "read", description: `Reading ${filePath}.`, operation_id: `read:${filePath}` });
      try {
        const read = await workspace.read({ file_path: filePath, start_line: 1, end_line: 900 });
        evidenceFiles.push({ file_path: filePath, total_lines: Number(read.total_lines || 0), content_excerpt: text(read.content, 12000) });
        findings.push(...sourceSignals(filePath, read.content));
      } catch (error) {
        findings.push({ kind: "read_failed", file_path: filePath, reason: text(error?.message || error, 500) });
      }
    }

    const tests = testCandidates(paths, focus);
    const testResults = [];
    for (const testPath of tests) {
      const args = ["--test", testPath];
      await publish(context, { phase: "CODE_VERIFICATION", action: "verify", description: `Running node --test ${testPath}.`, command: "node", command_args: args, verification_running: true });
      const result = await workspace.run({ command: "node", args, timeout_ms });
      testResults.push({ test_path: testPath, exit_code: Number(result.exit_code), passed: Number(result.exit_code) === 0, stdout: text(result.stdout, 5000), stderr: text(result.stderr, 3000) });
    }

    const pages = selected.filter((path) => /\/page\.(?:js|jsx|ts|tsx)$/i.test(path));
    const components = selected.filter((path) => path.startsWith("components/"));
    const apiRoutes = selected.filter((path) => path.startsWith("app/api/"));
    const failedTests = testResults.filter((item) => !item.passed);
    const unfinished = findings.filter((item) => item.kind === "unfinished_marker");
    const mobileRisks = findings.filter((item) => item.kind === "mobile_width_risk" || item.kind === "horizontal_overflow_risk");
    const sourceAuditComplete = selected.length > 0;
    const verificationPassed = testResults.length > 0 && failedTests.length === 0;
    const completion = failedTests.length ? "NOT_FINISHED_TEST_FAILURE" : unfinished.length ? "NOT_FINISHED_SOURCE_MARKERS" : verificationPassed ? "SOURCE_CONTRACTS_PASS_RUNTIME_UI_NOT_CERTIFIED" : "SOURCE_INSPECTED_RUNTIME_UI_NOT_CERTIFIED";

    await publish(context, { phase: "CODE_INSPECTION_COMPLETE", status: "completed", description: `Completed read-only ${label} source inspection across ${selected.length} files${testResults.length ? ` and ${testResults.length} verification test${testResults.length === 1 ? "" : "s"}` : ""}.`, verification_passed: failedTests.length === 0 && testResults.length > 0 });
    return {
      contract: CODE_AI_READ_ONLY_INSPECTION_CONTRACT,
      status: "COMPLETED",
      read_only: true,
      source_mutation_authority: false,
      commit_authority: false,
      deploy_authority: false,
      migration_authority: false,
      repository: { url: repository_url, ref, head_sha: repository.head_sha, clean: repository.clean === true },
      focus,
      completion_assessment: completion,
      source_audit_complete: sourceAuditComplete,
      runtime_ui_certified: false,
      counts: { matched_paths: paths.length, inspected_files: selected.length, pages: pages.length, components: components.length, api_routes: apiRoutes.length, verification_tests: testResults.length, failed_tests: failedTests.length, source_findings: findings.length },
      inspected_files: selected,
      evidence_files: evidenceFiles.map(({ file_path, total_lines }) => ({ file_path, total_lines })),
      findings: findings.slice(0, 30),
      verification: testResults,
      recommendations: [
        ...(failedTests.length ? failedTests.map((item) => `Repair failing contract: ${item.test_path}`) : []),
        ...(unfinished.length ? unfinished.slice(0, 6).map((item) => `Resolve ${item.kind} at ${item.file_path}:${item.line}`) : []),
        ...(mobileRisks.length ? mobileRisks.slice(0, 6).map((item) => `Review mobile layout risk at ${item.file_path}:${item.line}`) : []),
        "Run browser/mobile interaction verification before declaring the UI fully finished.",
      ].slice(0, 12),
    };
  } finally {
    await workspace.stop();
  }
}

export const CodeAIReadOnlyInspectionRuntime = Object.freeze({ contract: CODE_AI_READ_ONLY_INSPECTION_CONTRACT, run: runCodeAIReadOnlyInspection, mutation_authority: false });
export default CodeAIReadOnlyInspectionRuntime;
