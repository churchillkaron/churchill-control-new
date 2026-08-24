import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_BOOTSTRAP_V2";
const RAW_OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_RAW_OUTPUT ||
    "/tmp/avantiqo-code-github-live-certification.raw.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-code-github-live-certification.json",
);
const TEMP_VERCEL_ENV = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_VERCEL_ENV_OUTPUT ||
    `/tmp/avantiqo-code-vercel-development-${process.pid}.env`,
);

function text(value) {
  return String(value ?? "").trim();
}

function decodeJwtPayload(token) {
  const parts = text(token).split(".");
  if (parts.length < 2) return {};
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function envFileValue(source, name) {
  const prefix = `${name}=`;
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.startsWith(prefix)) continue;
    let value = line.slice(prefix.length).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

function oidcSnapshot(token) {
  const claims = decodeJwtPayload(token);
  const expiresAt = Number(claims?.exp);
  return {
    project_id: text(claims?.project_id || claims?.projectId) || null,
    owner_id: text(claims?.owner_id || claims?.ownerId) || null,
    environment: text(claims?.environment) || null,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : null,
    unexpired: Number.isFinite(expiresAt) ? expiresAt > Math.floor(Date.now() / 1000) + 60 : false,
  };
}

async function linkedProject() {
  const parsed = JSON.parse(await readFile(".vercel/project.json", "utf8"));
  const projectId = text(parsed?.projectId);
  const teamId = text(parsed?.orgId);
  if (!projectId || !teamId) {
    throw new Error("AVANTIQO_CODE_GITHUB_LIVE_LINKED_VERCEL_PROJECT_REQUIRED");
  }
  return {
    project_id: projectId,
    team_id: teamId,
    project_name: text(parsed?.projectName) || null,
  };
}

function oidcMatchesProject(snapshot, project) {
  return (
    snapshot?.unexpired === true &&
    snapshot?.project_id === project.project_id &&
    (!snapshot?.owner_id || snapshot.owner_id === project.team_id) &&
    (!snapshot?.environment || snapshot.environment === "development")
  );
}

function run(command, args, { env = process.env } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      resolveRun({
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
      });
    });
  });
}

async function refreshProjectOidc(project) {
  await unlink(TEMP_VERCEL_ENV).catch(() => null);
  let runResult;
  try {
    runResult = await run("vercel", [
      "env",
      "pull",
      TEMP_VERCEL_ENV,
      "--environment=development",
      "--yes",
    ]);
  } catch (error) {
    if (text(error?.code) === "ENOENT") {
      throw new Error("VERCEL_CLI_REQUIRED_FOR_PROJECT_SCOPED_OIDC_REFRESH");
    }
    throw error;
  }
  if (runResult.signal) {
    throw new Error(`VERCEL_ENV_PULL_SIGNAL:${runResult.signal}`);
  }
  if (runResult.code !== 0) {
    throw new Error(`VERCEL_ENV_PULL_FAILED:${runResult.code}`);
  }

  const source = await readFile(TEMP_VERCEL_ENV, "utf8");
  const token = envFileValue(source, "VERCEL_OIDC_TOKEN");
  if (!token) throw new Error("VERCEL_ENV_PULL_OIDC_TOKEN_MISSING");
  const snapshot = oidcSnapshot(token);
  if (!oidcMatchesProject(snapshot, project)) {
    throw new Error(
      `VERCEL_ENV_PULL_OIDC_PROJECT_MISMATCH:actual=${snapshot.project_id || "MISSING"}:expected=${project.project_id}`,
    );
  }
  return { token, snapshot };
}

const hadAttestationSecret = Boolean(text(process.env.AVANTIQO_CODE_MISSION_ATTESTATION_SECRET));
const hadRepositoryAllowlist = Boolean(text(process.env.AVANTIQO_CODE_GITHUB_REPOSITORIES));
const hadConnector = Boolean(text(process.env.AVANTIQO_CODE_GITHUB_CONNECTOR));

const project = await linkedProject();
let oidcToken = text(process.env.VERCEL_OIDC_TOKEN);
let oidc = oidcSnapshot(oidcToken);
let oidcSource = "environment_verified_project_scoped";
let oidcRefreshPerformed = false;

if (!oidcToken || !oidcMatchesProject(oidc, project)) {
  const refreshed = await refreshProjectOidc(project);
  oidcToken = refreshed.token;
  oidc = refreshed.snapshot;
  oidcSource = "vercel_env_pull_ephemeral_project_scoped";
  oidcRefreshPerformed = true;
}

const childEnv = {
  ...process.env,
  VERCEL_OIDC_TOKEN: oidcToken,
  AVANTIQO_CODE_GITHUB_REPOSITORIES:
    text(process.env.AVANTIQO_CODE_GITHUB_REPOSITORIES) ||
    "churchillkaron/churchill-control-new",
  AVANTIQO_CODE_GITHUB_CONNECTOR:
    text(process.env.AVANTIQO_CODE_GITHUB_CONNECTOR) ||
    "github/avantiqo-code",
  AVANTIQO_CODE_MISSION_ATTESTATION_SECRET:
    text(process.env.AVANTIQO_CODE_MISSION_ATTESTATION_SECRET) ||
    crypto.randomBytes(48).toString("base64url"),
  AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_OUTPUT: RAW_OUTPUT,
};

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  certification_configuration: {
    repository_allowlist_source: hadRepositoryAllowlist ? "environment" : "fixed_exact_certification_repository",
    connector_source: hadConnector ? "environment" : "code_runtime_tested_default",
    attestation_secret_source: hadAttestationSecret ? "environment" : "ephemeral_process_only",
    oidc_token_source: oidcSource,
  },
  linked_vercel_project: project,
  oidc_project_id: oidc.project_id,
  oidc_project_binding_verified: true,
  oidc_unexpired: oidc.unexpired,
  oidc_refresh_performed: oidcRefreshPerformed,
  production_attestation_secret_config_verified: hadAttestationSecret,
  env_local_modified: false,
  secret_values_logged: false,
  production_deploy_performed: false,
}, null, 2));

let certificationRun;
try {
  certificationRun = await run(
    process.execPath,
    ["scripts/certify-avantiqo-code-github-commit-local.mjs"],
    { env: childEnv },
  );
} finally {
  await unlink(TEMP_VERCEL_ENV).catch(() => null);
}

if (certificationRun.signal) {
  throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_SIGNAL:${certificationRun.signal}`);
}
if (certificationRun.code !== 0) {
  throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_UNDERLYING_CERTIFICATION_FAILED:${certificationRun.code}`);
}

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
    oidc_token_source: oidcSource,
  },
  linked_vercel_project: project,
  oidc_project_id: oidc.project_id,
  oidc_project_binding_verified: true,
  oidc_unexpired: oidc.unexpired,
  oidc_refresh_performed: oidcRefreshPerformed,
  live_commit_path_certified: true,
  production_attestation_secret_config_verified: hadAttestationSecret,
  production_activation_allowed: false,
  env_local_modified: false,
  temporary_vercel_env_deleted: true,
  secret_values_logged: false,
  production_deploy_performed: false,
};

await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: OUTPUT,
  linked_vercel_project_id: project.project_id,
  oidc_project_binding_verified: true,
  oidc_refresh_performed: oidcRefreshPerformed,
  governed_commit_verified: true,
  exact_artifact_recovery_verified: raw.exact_artifact_recovery_verified === true,
  live_commit_path_certified: true,
  production_attestation_secret_config_verified: hadAttestationSecret,
  attestation_secret_source: hadAttestationSecret ? "environment" : "ephemeral_process_only",
  env_local_modified: false,
  temporary_vercel_env_deleted: true,
  production_activation_allowed: false,
  production_deploy_performed: false,
}, null, 2));
