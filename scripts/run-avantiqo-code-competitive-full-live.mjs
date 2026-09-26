import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_FULL_LIVE_ORCHESTRATOR_V1";
const APPROVAL = "AVANTIQO_CODE_COMPETITIVE_FULL_BENCHMARK_APPROVED";
const dryRun = process.argv.includes("--dry-run");
const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const canonicalProvider = (value) => text(value).toLowerCase() === "gemini" ? "google" : text(value).toLowerCase();

function parseObjectEnv(name, required = true) {
  const raw = text(process.env[name]);
  if (!raw && !required) return {};
  if (!raw) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${CONTRACT}_${name}_INVALID_JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${CONTRACT}_${name}_INVALID`);
  return parsed;
}
const configuredProviders = text(process.env.AVANTIQO_CODE_COMPETITIVE_REQUIRED_PROVIDERS)
  .split(",")
  .map(canonicalProvider)
  .filter(Boolean);
const providers = [...new Set(configuredProviders.length ? configuredProviders : ["openai", "google"])].sort();
const models = parseObjectEnv("AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS");
const pricing = parseObjectEnv("AVANTIQO_CODE_COMPETITIVE_REFERENCE_PRICING", !dryRun);

for (const provider of providers) {
  if (!new Set(["openai", "anthropic", "google"]).has(provider)) throw new Error(`${CONTRACT}_PROVIDER_INVALID:${provider}`);
  if (!text(models[provider])) throw new Error(`${CONTRACT}_MODEL_REQUIRED:${provider}`);
  if (!dryRun) {
    const entry = pricing[provider];
    const input = Number(entry?.input_usd_per_1m);
    const output = Number(entry?.output_usd_per_1m);
    if (!(input > 0) || !(output > 0)) throw new Error(`${CONTRACT}_PRICING_REQUIRED:${provider}`);
  }
}

const root = text(process.env.AVANTIQO_CODE_COMPETITIVE_EVIDENCE_DIR) || "/tmp";
const paths = {
  owned_frontier: resolve(root, "avantiqo-code-frontier-owned-local.json"),
  owned_repository: resolve(root, "avantiqo-code-executable-repository-owned.json"),
  competitive: resolve(root, "avantiqo-code-competitive-benchmark.json"),
};
const referencePaths = Object.fromEntries(providers.map((provider) => [provider, {
  frontier: resolve(root, `avantiqo-code-competitive-reference-${provider}.json`),
  repository: resolve(root, `avantiqo-code-executable-repository-reference-${provider}.json`),
}]));

const plan = {
  contract: CONTRACT,
  providers,
  models: Object.fromEntries(providers.map((provider) => [provider, text(models[provider])])),
  paths: { ...paths, references: referencePaths },
  approvals_required: [
    APPROVAL,
    "AVANTIQO_CODE_FRONTIER_LOCAL_APPROVED",
    "AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED",
    "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_APPROVED",
    "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_APPROVED",
  ],
  external_provider_execution_performed: false,
  production_deploy_performed: false,
};

if (dryRun) {
  console.log(JSON.stringify({ success: true, mode: "DRY_RUN", ...plan }, null, 2));
  process.exit();
}
if (!approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);
for (const lowerApproval of plan.approvals_required.slice(1)) {
  if (!approved(process.env[lowerApproval])) throw new Error(`${lowerApproval}=YES_REQUIRED`);
}

function runNode(script, args, env, label) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_${label}_FAILED:${result.status}:${text(result.stderr || result.stdout).slice(0, 4000)}`);
  }
  return result;
}

runNode("scripts/run-avantiqo-code-frontier-local.mjs", ["--output", paths.owned_frontier], {}, "OWNED_FRONTIER");
runNode("scripts/run-avantiqo-code-executable-repository-local.mjs", [], {
  AVANTIQO_CODE_EXECUTABLE_REPOSITORY_OUTPUT: paths.owned_repository,
}, "OWNED_REPOSITORY");
for (const provider of providers) {
  const model = text(models[provider]);
  const price = pricing[provider];
  const commonReferenceEnv = {
    AVANTIQO_CODE_COMPETITIVE_REFERENCE_PROVIDER: provider,
    AVANTIQO_CODE_COMPETITIVE_REFERENCE_MODEL: model,
    AVANTIQO_CODE_COMPETITIVE_REFERENCE_INPUT_USD_PER_1M: String(price.input_usd_per_1m),
    AVANTIQO_CODE_COMPETITIVE_REFERENCE_OUTPUT_USD_PER_1M: String(price.output_usd_per_1m),
  };
  runNode("scripts/run-avantiqo-code-competitive-reference-live.mjs", [], {
    ...commonReferenceEnv,
    AVANTIQO_CODE_COMPETITIVE_REFERENCE_OUTPUT: referencePaths[provider].frontier,
  }, `REFERENCE_FRONTIER_${provider.toUpperCase()}`);

  runNode("scripts/run-avantiqo-code-executable-repository-local.mjs", [], {
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_PROVIDER: provider,
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_MODEL: model,
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_INPUT_USD_PER_1M: String(price.input_usd_per_1m),
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_OUTPUT_USD_PER_1M: String(price.output_usd_per_1m),
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_OUTPUT: referencePaths[provider].repository,
  }, `REFERENCE_REPOSITORY_${provider.toUpperCase()}`);
}
const frontierReferences = providers.map((provider) => referencePaths[provider].frontier).join(",");
const repositoryReferences = providers.map((provider) => referencePaths[provider].repository).join(",");
runNode("scripts/benchmark-avantiqo-code-competitive.mjs", [], {
  AVANTIQO_CODE_COMPETITIVE_OWNED: paths.owned_frontier,
  AVANTIQO_CODE_COMPETITIVE_REFERENCES: frontierReferences,
  AVANTIQO_CODE_COMPETITIVE_OWNED_REPOSITORY_EVIDENCE: paths.owned_repository,
  AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPOSITORY_EVIDENCE: repositoryReferences,
  AVANTIQO_CODE_COMPETITIVE_REQUIRED_PROVIDERS: providers.join(","),
  AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS: JSON.stringify(plan.models),
  AVANTIQO_CODE_COMPETITIVE_OUTPUT: paths.competitive,
}, "COMPETITIVE_CERTIFICATION");

const report = JSON.parse(await readFile(paths.competitive, "utf8"));
console.log(JSON.stringify({
  success: report.competitive_certified === true,
  contract: CONTRACT,
  providers,
  competitive_report: paths.competitive,
  competitive_certified: report.competitive_certified === true,
  repository_task_artifact_certified: report.repository_task_evidence?.certified === true,
  quality_superiority_observed: report.quality_superiority_observed === true,
  superiority_claim_allowed: report.superiority_claim_allowed === true,
  external_provider_execution_performed: true,
  runtime_provider_effect: "NONE",
  production_deploy_performed: false,
}, null, 2));
if (report.competitive_certified !== true) process.exitCode = 2;
