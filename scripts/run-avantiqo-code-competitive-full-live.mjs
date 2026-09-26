import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import {
  attestCodeAICompetitiveFullRunManifest,
  verifyCodeAICompetitiveFullRunManifest,
} from "../lib/code/runtime/CodeAICompetitiveFullRunAttestationRuntime.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_FULL_LIVE_ORCHESTRATOR_V1";
const APPROVAL = "AVANTIQO_CODE_COMPETITIVE_FULL_BENCHMARK_APPROVED";
const dryRun = process.argv.includes("--dry-run");
const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const canonicalProvider = (value) => text(value).toLowerCase() === "gemini" ? "google" : text(value).toLowerCase();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const orchestratorRunId = dryRun ? "DRY_RUN" : randomUUID();
const orchestratorStartedAt = dryRun ? null : new Date();

function parseObjectEnv(name, required = true) {
  const raw = text(process.env[name]);
  if (!raw && !required) return {};
  if (!raw) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${CONTRACT}_${name}_INVALID_JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${CONTRACT}_${name}_INVALID`);
  return parsed;
}

function runGit(args) {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${CONTRACT}_GIT_PROVENANCE_FAILED:${args.join("_")}`);
  return text(result.stdout);
}

function sourceProvenance() {
  const sourceCommit = runGit(["rev-parse", "HEAD"]).toLowerCase();
  const ref = runGit(["branch", "--show-current"]);
  const clean = runGit(["status", "--porcelain"]).length === 0;
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error(`${CONTRACT}_SOURCE_COMMIT_INVALID`);
  if (ref !== "main") throw new Error(`${CONTRACT}_CURRENT_MAIN_REQUIRED`);
  if (!clean) throw new Error(`${CONTRACT}_CLEAN_REPOSITORY_REQUIRED`);
  return { source_commit: sourceCommit, ref, clean };
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

const canonicalConfiguration = {
  providers,
  models: Object.fromEntries(providers.map((provider) => [provider, text(models[provider])])),
  pricing: Object.fromEntries(providers.map((provider) => [provider, {
    input_usd_per_1m: Number(pricing?.[provider]?.input_usd_per_1m || 0),
    output_usd_per_1m: Number(pricing?.[provider]?.output_usd_per_1m || 0),
  }])),
};
const configurationSha256 = sha256(JSON.stringify(canonicalConfiguration));

const evidenceRoot = resolve(text(process.env.AVANTIQO_CODE_COMPETITIVE_EVIDENCE_DIR) || "/tmp");
const runRoot = resolve(evidenceRoot, orchestratorRunId);
const paths = {
  owned_frontier: resolve(runRoot, "avantiqo-code-frontier-owned-local.json"),
  owned_repository: resolve(runRoot, "avantiqo-code-executable-repository-owned.json"),
  competitive: resolve(runRoot, "avantiqo-code-competitive-benchmark.json"),
  manifest: resolve(runRoot, "avantiqo-code-competitive-full-run-manifest.json"),
};
const referencePaths = Object.fromEntries(providers.map((provider) => [provider, {
  frontier: resolve(runRoot, `avantiqo-code-competitive-reference-${provider}.json`),
  repository: resolve(runRoot, `avantiqo-code-executable-repository-reference-${provider}.json`),
}]));

const plan = {
  contract: CONTRACT,
  orchestrator_run_id: orchestratorRunId,
  providers,
  models: Object.fromEntries(providers.map((provider) => [provider, text(models[provider])])),
  configuration_sha256: configurationSha256,
  evidence_root: evidenceRoot,
  run_root: runRoot,
  paths: { ...paths, references: referencePaths },
  approvals_required: [
    APPROVAL,
    "AVANTIQO_CODE_FRONTIER_LOCAL_APPROVED",
    "AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED",
    "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_APPROVED",
    "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_APPROVED",
  ],
  fresh_artifact_policy: {
    stale_output_reuse_forbidden: true,
    generated_at_must_be_within_orchestrator_run: true,
    manifest_sha256_required: true,
    concurrent_run_isolation_required: true,
  },
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
const orchestratorSource = sourceProvenance();

async function prepareRunDirectory() {
  await mkdir(evidenceRoot, { recursive: true });
  try {
    await mkdir(runRoot, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${CONTRACT}_RUN_DIRECTORY_ALREADY_EXISTS`);
    throw error;
  }
}

async function clearRunOutputs() {
  const files = [
    paths.owned_frontier, paths.owned_repository, paths.competitive, paths.manifest,
    ...providers.flatMap((provider) => [referencePaths[provider].frontier, referencePaths[provider].repository]),
  ];
  await Promise.all(files.map((file) => rm(file, { force: true })));
}

async function verifyFreshArtifact(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new Error(`${CONTRACT}_${label}_ARTIFACT_MISSING`);
  if (orchestratorStartedAt && info.mtimeMs + 1000 < orchestratorStartedAt.getTime()) {
    throw new Error(`${CONTRACT}_${label}_ARTIFACT_STALE_MTIME`);
  }
  const raw = await readFile(path);
  let parsed;
  try { parsed = JSON.parse(raw.toString("utf8")); } catch { throw new Error(`${CONTRACT}_${label}_ARTIFACT_INVALID_JSON`); }
  const generatedAt = Date.parse(text(parsed?.generated_at || parsed?.measured_at));
  if (!Number.isFinite(generatedAt)) throw new Error(`${CONTRACT}_${label}_ARTIFACT_TIMESTAMP_REQUIRED`);
  if (orchestratorStartedAt && generatedAt < orchestratorStartedAt.getTime() - 1000) {
    throw new Error(`${CONTRACT}_${label}_ARTIFACT_PREDATES_RUN`);
  }
  if (generatedAt > Date.now() + 60_000) throw new Error(`${CONTRACT}_${label}_ARTIFACT_FROM_FUTURE`);
  return {
    path,
    sha256: sha256(raw),
    bytes: raw.length,
    generated_at: new Date(generatedAt).toISOString(),
    benchmark_run_id: text(parsed?.benchmark_run_id) || null,
    contract: text(parsed?.contract) || null,
    runner_source_commit: text(parsed?.runner_source_commit).toLowerCase() || null,
    provider: text(parsed?.provider || parsed?.model?.provider) || null,
    model: text(parsed?.model?.product_model || parsed?.model?.runtime_model || parsed?.model) || null,
    provider_execution_performed: parsed?.provider_execution_performed === true,
    stage: label,
  };
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

await prepareRunDirectory();
await clearRunOutputs();
const producedArtifacts = [];

runNode("scripts/run-avantiqo-code-frontier-local.mjs", ["--output", paths.owned_frontier], {}, "OWNED_FRONTIER");
producedArtifacts.push(await verifyFreshArtifact(paths.owned_frontier, "OWNED_FRONTIER"));
runNode("scripts/run-avantiqo-code-executable-repository-local.mjs", [], {
  AVANTIQO_CODE_EXECUTABLE_REPOSITORY_OUTPUT: paths.owned_repository,
}, "OWNED_REPOSITORY");
producedArtifacts.push(await verifyFreshArtifact(paths.owned_repository, "OWNED_REPOSITORY"));
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
  producedArtifacts.push(await verifyFreshArtifact(referencePaths[provider].frontier, `REFERENCE_FRONTIER_${provider.toUpperCase()}`));

  runNode("scripts/run-avantiqo-code-executable-repository-local.mjs", [], {
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_PROVIDER: provider,
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_MODEL: model,
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_INPUT_USD_PER_1M: String(price.input_usd_per_1m),
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_OUTPUT_USD_PER_1M: String(price.output_usd_per_1m),
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_OUTPUT: referencePaths[provider].repository,
  }, `REFERENCE_REPOSITORY_${provider.toUpperCase()}`);
  producedArtifacts.push(await verifyFreshArtifact(referencePaths[provider].repository, `REFERENCE_REPOSITORY_${provider.toUpperCase()}`));
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
producedArtifacts.push(await verifyFreshArtifact(paths.competitive, "COMPETITIVE_CERTIFICATION"));

const requiredReferenceStages = providers.flatMap((provider) => [
  `REFERENCE_FRONTIER_${provider.toUpperCase()}`,
  `REFERENCE_REPOSITORY_${provider.toUpperCase()}`,
]);
const referenceExecutionArtifacts = producedArtifacts.filter((artifact) => requiredReferenceStages.includes(artifact.stage));
const externalProviderExecutionPerformed =
  referenceExecutionArtifacts.length === requiredReferenceStages.length &&
  referenceExecutionArtifacts.every((artifact) => artifact.provider_execution_performed === true);
if (!externalProviderExecutionPerformed) {
  throw new Error(`${CONTRACT}_REFERENCE_PROVIDER_EXECUTION_EVIDENCE_INCOMPLETE`);
}
for (const provider of providers) {
  const expectedModel = text(models[provider]);
  const providerArtifacts = referenceExecutionArtifacts.filter((artifact) => artifact.provider === provider);
  if (providerArtifacts.length !== 2 || providerArtifacts.some((artifact) => artifact.model !== expectedModel)) {
    throw new Error(`${CONTRACT}_REFERENCE_PROVIDER_MODEL_EVIDENCE_MISMATCH:${provider}`);
  }
}
const sourceBoundArtifacts = producedArtifacts.filter((artifact) => artifact.stage !== "COMPETITIVE_CERTIFICATION");
if (sourceBoundArtifacts.some((artifact) => artifact.runner_source_commit !== orchestratorSource.source_commit)) {
  throw new Error(`${CONTRACT}_ARTIFACT_SOURCE_COMMIT_MISMATCH`);
}

const report = JSON.parse(await readFile(paths.competitive, "utf8"));
const finalSource = sourceProvenance();
if (
  finalSource.source_commit !== orchestratorSource.source_commit ||
  finalSource.ref !== orchestratorSource.ref ||
  finalSource.clean !== orchestratorSource.clean
) {
  throw new Error(`${CONTRACT}_SOURCE_CHANGED_DURING_RUN`);
}
const manifestCore = {
  contract: "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST_V1",
  orchestrator_run_id: orchestratorRunId,
  run_root: runRoot,
  started_at: orchestratorStartedAt?.toISOString() || null,
  runner_source_commit: orchestratorSource.source_commit,
  runner_ref: orchestratorSource.ref,
  runner_repository_clean: orchestratorSource.clean,
  source_stable_for_entire_run: true,
  configuration_sha256: configurationSha256,
  completed_at: new Date().toISOString(),
  providers,
  models: plan.models,
  artifacts: producedArtifacts,
  external_provider_execution_performed: externalProviderExecutionPerformed,
  competitive_certified: report.competitive_certified === true,
  production_deploy_performed: false,
};
const manifest = attestCodeAICompetitiveFullRunManifest(manifestCore, { env: process.env });
verifyCodeAICompetitiveFullRunManifest(manifest, { env: process.env });
await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const manifestRaw = await readFile(paths.manifest);
const manifestSha256 = sha256(manifestRaw);
console.log(JSON.stringify({
  success: report.competitive_certified === true,
  contract: CONTRACT,
  orchestrator_run_id: orchestratorRunId,
  providers,
  competitive_report: paths.competitive,
  manifest: paths.manifest,
  manifest_sha256: manifestSha256,
  manifest_attestation_contract: manifest.full_run_attestation?.contract || null,
  manifest_attestation_digest: manifest.full_run_attestation?.digest || null,
  competitive_certified: report.competitive_certified === true,
  repository_task_artifact_certified: report.repository_task_evidence?.certified === true,
  quality_superiority_observed: report.quality_superiority_observed === true,
  superiority_claim_allowed: report.superiority_claim_allowed === true,
  external_provider_execution_performed: externalProviderExecutionPerformed,
  runtime_provider_effect: "NONE",
  production_deploy_performed: false,
}, null, 2));
if (report.competitive_certified !== true) process.exitCode = 2;
