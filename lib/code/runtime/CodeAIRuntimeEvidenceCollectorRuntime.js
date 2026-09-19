import { CodeWorkspaceRuntime } from "./CodeWorkspaceRuntime.js";
import { assessCodeAIRuntimeEvidenceCoverage } from "./CodeAIRuntimeEvidenceCoverageRuntime.js";
import { selectCodeAIDependencyAwareVerifiers } from "./CodeAIDependencyAwareVerifierSelectionRuntime.js";

export const CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT =
  "AVANTIQO_CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_V1";

const MAX_PROBES = 4;
const MAX_OUTPUT = 2400;
const UI_RUNTIME_PATH = /(^|\/)(?:e2e|playwright|cypress)(\/|$)|\.(?:e2e|browser)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
const API_RUNTIME_PATH = /(^|\/)(?:integration|api|routes?|rpc)(\/|$)|\.(?:integration|api)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
const NODE_TEST_PATH = /\.(?:test|spec|e2e|browser|integration|api)\.(?:js|mjs|cjs)$/i;
const PLAYWRIGHT_PATH = /(^|\/)(?:e2e|playwright)(\/|$)|\.(?:e2e|browser)\.(?:ts|tsx)$/i;
const CYPRESS_PATH = /(^|\/)cypress(\/|$)/i;

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
function bounded(value) {
  return text(value, MAX_OUTPUT);
}

function changedPaths(state = {}) {
  return unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((entry) => entry?.path),
  ]);
}

function staticRouteFromPagePath(value) {
  const path = text(value, 1200).replace(/\\/g, "/");
  const appMatch = path.match(/^app\/(.+\/)?page\.(?:js|jsx|ts|tsx)$/i);
  if (appMatch) {
    const raw = text(appMatch[1] || "", 1000).replace(/\/$/, "");
    const segments = raw.split("/").filter(Boolean).filter((segment) => !/^\(.+\)$/.test(segment));
    if (segments.some((segment) => /\[|\]/.test(segment))) return null;
    return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
  }
  const pagesMatch = path.match(/^pages\/(.+)\.(?:js|jsx|ts|tsx)$/i);
  if (!pagesMatch || /(?:^|\/)_(?:app|document|error)$/.test(pagesMatch[1])) return null;
  const segments = pagesMatch[1].split("/").filter(Boolean);
  if (segments.some((segment) => /\[|\]/.test(segment))) return null;
  if (segments.at(-1) === "index") segments.pop();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function previewRoutes(state = {}) {
  const explicit = list(state?.objective_context?.runtime_preview_routes)
    .map((route) => text(route, 500))
    .filter((route) => /^\/(?!\/)/.test(route) && !route.includes(".."));
  return unique([
    ...explicit,
    ...changedPaths(state).map(staticRouteFromPagePath),
  ]).slice(0, 4);
}

async function waitForLocalRoute(workspace, route) {
  const url = `http://127.0.0.1:3000${route === "/" ? "" : route}`;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const probe = await workspace.run({
      command: "node",
      args: [
        "-e",
        `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))`,
      ],
      timeout_ms: 10000,
    }).catch(() => ({ exit_code: 1 }));
    if (probe.exit_code === 0) return url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`CODE_AI_RUNTIME_PREVIEW_NOT_READY:${route}`);
}

async function runAgentBrowser(workspace, route) {
  if (typeof workspace.startDetached !== "function") {
    throw new Error("CODE_AI_RUNTIME_PREVIEW_DETACHED_PROCESS_UNAVAILABLE");
  }
  const lock = await workspace.run({
    command: "git",
    args: ["ls-files", "--error-unmatch", "package-lock.json"],
    timeout_ms: 10000,
  }).catch(() => ({ exit_code: 1 }));
  if (lock.exit_code !== 0) {
    throw new Error("CODE_AI_RUNTIME_PREVIEW_PACKAGE_LOCK_REQUIRED");
  }
  const install = await workspace.run({
    command: "npm",
    args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    timeout_ms: 240000,
  });
  if (install.exit_code !== 0) {
    throw new Error(`CODE_AI_RUNTIME_PREVIEW_DEPENDENCY_INSTALL_FAILED:${install.exit_code}`);
  }

  const server = await workspace.startDetached({
    command: "npm",
    args: ["run", "dev", "--", "-H", "127.0.0.1", "-p", "3000"],
  });
  let browserOpened = false;
  try {
    const url = await waitForLocalRoute(workspace, route);
    const run = async (args) => workspace.run({
      command: "npx",
      args: ["--yes", "agent-browser", ...args],
      timeout_ms: 120000,
    });
    const opened = await run(["open", url]);
    if (opened.exit_code !== 0) throw new Error(`CODE_AI_RUNTIME_BROWSER_OPEN_FAILED:${opened.exit_code}`);
    browserOpened = true;
    const waited = await run(["wait", "--load", "networkidle"]);
    const content = await run(["eval", 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"']);
    const overlay = await run(["eval", 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"']);
    const snapshot = await run(["snapshot", "-i"]);
    const passed =
      waited.exit_code === 0 &&
      content.exit_code === 0 && /HAS_CONTENT/.test(String(content.stdout || "")) &&
      overlay.exit_code === 0 && /\bOK\b/.test(String(overlay.stdout || "")) &&
      snapshot.exit_code === 0;
    return {
      route,
      url,
      passed,
      waited: waited.exit_code === 0,
      has_content: /HAS_CONTENT/.test(String(content.stdout || "")),
      error_overlay_absent: /\bOK\b/.test(String(overlay.stdout || "")),
      interactive_snapshot: bounded(snapshot.stdout),
      stderr: bounded([waited.stderr, content.stderr, overlay.stderr, snapshot.stderr].filter(Boolean).join("\n")),
    };
  } finally {
    if (browserOpened) {
      await workspace.run({
        command: "npx",
        args: ["--yes", "agent-browser", "close"],
        timeout_ms: 30000,
      }).catch(() => null);
    }
    await server.kill().catch(() => null);
  }
}

function commandForTest(filePath) {
  const path = text(filePath, 1200);
  if (!path) return null;
  if (CYPRESS_PATH.test(path)) {
    return { command: "npx", args: ["cypress", "run", "--spec", path], family: "browser_e2e" };
  }
  if (NODE_TEST_PATH.test(path)) {
    return {
      command: "node",
      args: ["--test", path],
      family: UI_RUNTIME_PATH.test(path) ? "browser_e2e" : "api_integration",
    };
  }
  if (PLAYWRIGHT_PATH.test(path)) {
    return { command: "npx", args: ["playwright", "test", path], family: "browser_e2e" };
  }
  return null;
}

export function planCodeAIRuntimeEvidenceCollection({
  state = {},
  quality = {},
  behavioral_verification = null,
} = {}) {
  const behavioral = object(behavioral_verification);
  const coverage = assessCodeAIRuntimeEvidenceCoverage({
    state,
    quality,
    behavioral_verification: behavioral,
  });
  if (!coverage.required || coverage.verified) {
    return {
      contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
      required: coverage.required,
      applicable: false,
      reason: coverage.required ? "RUNTIME_EVIDENCE_ALREADY_VERIFIED" : "RUNTIME_EVIDENCE_NOT_REQUIRED",
      coverage,
      probes: [],
    };
  }

  const dependencySelection = selectCodeAIDependencyAwareVerifiers({ state });
  const observed = unique([
    ...list(dependencySelection.selected_test_paths),
    ...list(behavioral.observed_impacted_test_paths),
    ...list(behavioral.matched_impacted_test_paths),
  ]);
  const needsUi = list(coverage.missing_evidence).includes("UI_BROWSER_OR_E2E_RUNTIME_EVIDENCE");
  const needsApi = list(coverage.missing_evidence).includes("API_RUNTIME_OR_TARGETED_INTEGRATION_EVIDENCE");
  const candidates = observed.filter((path) =>
    (needsUi && UI_RUNTIME_PATH.test(path)) ||
    (needsApi && (API_RUNTIME_PATH.test(path) || NODE_TEST_PATH.test(path)))
  );
  const probes = candidates
    .map((path) => ({ path, ...object(commandForTest(path)) }))
    .filter((probe) => probe.command)
    .slice(0, MAX_PROBES);
  const routes = needsUi ? previewRoutes(state) : [];
  const browserFallback = probes.length === 0 && needsUi && routes.length > 0;

  return {
    contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
    required: true,
    applicable: probes.length > 0 || browserFallback,
    reason: probes.length || browserFallback ? null : "NO_DETERMINISTIC_RUNTIME_PROBE_AVAILABLE",
    coverage,
    dependency_aware_verifier_selection: dependencySelection,
    probes,
    browser_fallback: browserFallback,
    preview_routes: routes,
    model_call_required: false,
    source_mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export async function collectCodeAIRuntimeEvidence({
  state = {},
  quality = {},
  behavioral_verification = null,
  openWorkspace = CodeWorkspaceRuntime.open,
} = {}) {
  const source = object(state);
  const plan = planCodeAIRuntimeEvidenceCollection({ state: source, quality, behavioral_verification });
  if (!plan.applicable) {
    return { ...plan, collected: false, evidence: [], probe_results: [] };
  }
  const repositoryUrl = text(source.repository_url, 1000);
  if (!repositoryUrl) throw new Error("CODE_AI_RUNTIME_EVIDENCE_REPOSITORY_REQUIRED");
  const workspace = await openWorkspace({
    repository_url: repositoryUrl,
    ref: text(source.ref, 160) || "main",
    resume_patch: text(source.patch, 900000) || null,
    timeout_ms: 180000,
    workspace_target: text(source?.objective_context?.workspace_target, 80) || undefined,
  });
  const results = [];
  try {
    for (const probe of plan.probes) {
      let result;
      try {
        result = await workspace.run({
          command: probe.command,
          args: probe.args,
          timeout_ms: 120000,
        });
      } catch (error) {
        result = {
          exit_code: 125,
          stdout: "",
          stderr: text(error?.message || error, MAX_OUTPUT),
        };
      }
      results.push({
        path: probe.path,
        family: probe.family,
        command: probe.command,
        args: probe.args,
        exit_code: Number(result?.exit_code ?? 125),
        stdout: bounded(result?.stdout),
        stderr: bounded(result?.stderr),
      });
    }
    if (plan.browser_fallback) {
      for (const route of list(plan.preview_routes).slice(0, 2)) {
        try {
          const browser = await runAgentBrowser(workspace, route);
          results.push({
            path: route,
            family: "browser_preview",
            command: "agent-browser",
            args: ["open", browser.url],
            exit_code: browser.passed ? 0 : 1,
            stdout: bounded(JSON.stringify({
              waited: browser.waited,
              has_content: browser.has_content,
              error_overlay_absent: browser.error_overlay_absent,
              interactive_snapshot: browser.interactive_snapshot,
            })),
            stderr: browser.stderr,
          });
        } catch (error) {
          results.push({
            path: route,
            family: "browser_preview",
            command: "agent-browser",
            args: [],
            exit_code: 125,
            stdout: "",
            stderr: text(error?.message || error, MAX_OUTPUT),
          });
        }
      }
    }
  } finally {
    await workspace.stop().catch(() => null);
  }

  const evidence = results
    .filter((result) => result.exit_code === 0)
    .map((result) => ({
      at: new Date().toISOString(),
      kind: result.family,
      source: "CODE_AI_DETERMINISTIC_RUNTIME_EVIDENCE_COLLECTOR",
      verified: true,
      passed: true,
      test_path: result.path,
      command: result.command,
      args: result.args,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      final_patch_replayed_in_isolated_workspace: true,
      provider_call_performed: false,
      model_call_performed: false,
      authorization_effect: "NONE",
    }));

  return {
    ...plan,
    collected: results.length > 0,
    evidence,
    probe_results: results,
    passed_probe_count: evidence.length,
    failed_probe_count: results.length - evidence.length,
  };
}

export const CodeAIRuntimeEvidenceCollectorRuntime = Object.freeze({
  contract: CODE_AI_RUNTIME_EVIDENCE_COLLECTOR_CONTRACT,
  plan: planCodeAIRuntimeEvidenceCollection,
  collect: collectCodeAIRuntimeEvidence,
  max_probes: MAX_PROBES,
  model_call_required: false,
  source_mutation_authority: false,
  commit_authority: false,
  deploy_authority: false,
});

export default CodeAIRuntimeEvidenceCollectorRuntime;
