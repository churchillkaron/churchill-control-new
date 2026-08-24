import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_BOOTSTRAP_V1";
const RAW_OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_RAW_OUTPUT ||
    "/tmp/avantiqo-code-github-live-certification.raw.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-code-github-live-certification.json",
);

function text(value) {
  return String(value ?? "").trim();
}

const hadAttestationSecret = Boolean(text(process.env.AVANTIQO_CODE_MISSION_ATTESTATION_SECRET));
const hadRepositoryAllowlist = Boolean(text(process.env.AVANTIQO_CODE_GITHUB_REPOSITORIES));
const hadConnector = Boolean(text(process.env.AVANTIQO_CODE_GITHUB_CONNECTOR));
const hadOidc = Boolean(text(process.env.VERCEL_OIDC_TOKEN));

if (!hadRepositoryAllowlist) {
  process.env.AVANTIQO_CODE_GITHUB_REPOSITORIES = "churchillkaron/churchill-control-new";
}
if (!hadConnector) {
  process.env.AVANTIQO_CODE_GITHUB_CONNECTOR = "github/avantiqo-code";
}
if (!hadAttestationSecret) {
  process.env.AVANTIQO_CODE_MISSION_ATTESTATION_SECRET = crypto.randomBytes(48).toString("base64url");
}
if (!hadOidc) {
  throw new Error(
    "VERCEL_OIDC_TOKEN_REQUIRED_RUN_VERCEL_ENV_PULL_OR_REFRESH_LOCAL_ENV_BEFORE_LIVE_CERTIFICATION",
  );
}

process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_OUTPUT = RAW_OUTPUT;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  certification_configuration: {
    repository_allowlist_source: hadRepositoryAllowlist ? "environment" : "fixed_exact_certification_repository",
    connector_source: hadConnector ? "environment" : "code_runtime_tested_default",
    attestation_secret_source: hadAttestationSecret ? "environment" : "ephemeral_process_only",
    oidc_token_source: "environment",
  },
  production_attestation_secret_config_verified: hadAttestationSecret,
  secret_values_logged: false,
  production_deploy_performed: false,
}, null, 2));

await import("./certify-avantiqo-code-github-commit-local.mjs");

const raw = JSON.parse(await readFile(RAW_OUTPUT, "utf8"));
if (raw?.success !== true || raw?.governed_commit_verified !== true) {
  throw new Error("AVANTIQO_CODE_GITHUB_LIVE_UNDERLYING_CERTIFICATION_NOT_VERIFIED");
}

const result = {
  ...raw,
  bootstrap_contract: CONTRACT,
  certification_configuration: {
    repository_allowlist_source: hadRepositoryAllowlist ? "environment" : "fixed_exact_certification_repository",
    connector_source: hadConnector ? "environment" : "code_runtime_tested_default",
    attestation_secret_source: hadAttestationSecret ? "environment" : "ephemeral_process_only",
    oidc_token_source: "environment",
  },
  live_commit_path_certified: true,
  production_attestation_secret_config_verified: hadAttestationSecret,
  production_activation_allowed: false,
  secret_values_logged: false,
  production_deploy_performed: false,
};

await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: OUTPUT,
  governed_commit_verified: true,
  exact_artifact_recovery_verified: raw.exact_artifact_recovery_verified === true,
  live_commit_path_certified: true,
  production_attestation_secret_config_verified: hadAttestationSecret,
  attestation_secret_source: hadAttestationSecret ? "environment" : "ephemeral_process_only",
  production_activation_allowed: false,
  production_deploy_performed: false,
}, null, 2));
