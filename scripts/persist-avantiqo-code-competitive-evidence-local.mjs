import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_EVIDENCE_PERSIST_LOCAL_V1";
const reportPath = resolve(
  process.env.AVANTIQO_CODE_COMPETITIVE_REPORT ||
    "/tmp/avantiqo-code-competitive-benchmark.json",
);
const backlogPath = resolve(
  process.env.AVANTIQO_CODE_COMPETITIVE_BACKLOG ||
    "/tmp/avantiqo-code-competitive-backlog.json",
);
function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
async function loadLocalEnv() {
  let source = "";
  try { source = await readFile(".env.local", "utf8"); } catch { return false; }
  for (const rawLine of source.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || text(process.env[match[1]], 12000)) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
  return true;
}
function shell(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 1200);
}
function currentMainCommit() {
  shell("git", ["fetch", "origin", "main"], "CODE_COMPETITIVE_EVIDENCE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "CODE_COMPETITIVE_EVIDENCE_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`CODE_COMPETITIVE_EVIDENCE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "CODE_COMPETITIVE_EVIDENCE_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "CODE_COMPETITIVE_EVIDENCE_REMOTE_FAILED");
  if (head !== remote) throw new Error(`CODE_COMPETITIVE_EVIDENCE_CURRENT_MAIN_REQUIRED:${head}:${remote}`);
  return head;
}

const localEnvLoaded = await loadLocalEnv();
const mainCommit = currentMainCommit();
const [report, backlog] = await Promise.all([
  readFile(reportPath, "utf8").then(JSON.parse),
  readFile(backlogPath, "utf8").then(JSON.parse),
]);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const {
  persistCodeAICompetitiveBenchmarkEvidence,
} = await import("@/lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime");

const persisted = await persistCodeAICompetitiveBenchmarkEvidence({
  report,
  backlog,
  storage_repository_commit: mainCommit,
});

console.log(JSON.stringify({
  success: persisted.persisted === true,
  contract: CONTRACT,
  local_env_loaded: localEnvLoaded,
  main_commit: mainCommit,
  evidence_contract: persisted?.evidence?.contract || null,
  evidence_current: persisted?.evidence?.evidence_current === true,
  competitive_certified: persisted?.evidence?.competitive_certified === true,
  superiority_claim_allowed: persisted?.evidence?.superiority_claim_allowed === true,
  comparison_count: Array.isArray(persisted?.evidence?.comparisons)
    ? persisted.evidence.comparisons.length
    : 0,
  improvement_backlog_count: Array.isArray(persisted?.evidence?.improvement_backlog)
    ? persisted.evidence.improvement_backlog.length
    : 0,
  provider_routing_effect: "NONE",
  commit_authority: false,
  production_deploy_authority: false,
  secrets_printed: false,
}, null, 2));
