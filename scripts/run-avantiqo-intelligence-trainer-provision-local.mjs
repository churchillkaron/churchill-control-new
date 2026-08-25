import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_GOVERNED_PROVISION_ENTRYPOINT_V2";
const CANONICAL_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const REQUIRED_VOLUME_SIZE_GB = 160;
const CORE_SCRIPT = "scripts/provision-avantiqo-intelligence-trainer-runpod-local.mjs";
const RECOVERY_SCRIPT = "scripts/recover-avantiqo-intelligence-trainer-provision-local.mjs";
const ENV_FILE_VARIABLES = [
  "AVANTIQO_INTELLIGENCE_RUNPOD_ENV_FILE",
  "AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE",
];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeAssignmentValue(rawValue) {
  let value = String(rawValue ?? "").trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    const quote = value[0];
    value = value.slice(1, -1);
    if (quote === '"') {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return value;
}

function explicitEnvPath() {
  for (const name of ENV_FILE_VARIABLES) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  const fallback = path.resolve(process.cwd(), ".env.local");
  return fs.existsSync(fallback) ? fallback : "";
}

function loadRelevantLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      path_available: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      secret_values_printed: false,
    };
  }
  const source = fs.readFileSync(envPath, "utf8");
  let relevantAssignmentCount = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    const [, name, rawValue] = match;
    if (
      !/^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) &&
      name !== "AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_PROVISION_APPROVED" &&
      name !== "AVANTIQO_INTELLIGENCE_RUNPOD_REGISTRY_AUTH_ID" &&
      name !== "AVANTIQO_INTELLIGENCE_TRAINER_NETWORK_VOLUME_ID" &&
      name !== "AVANTIQO_INTELLIGENCE_TRAINER_GPU_TYPE_IDS" &&
      name !== "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID"
    ) {
      continue;
    }
    relevantAssignmentCount += 1;
    const value = decodeAssignmentValue(rawValue);
    if (!text(process.env[name]) && value) process.env[name] = value;
  }
  return {
    path_available: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    secret_values_printed: false,
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw, 1000);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

function managementCredentialCandidates() {
  const preferred = ["RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_API_KEY"];
  const discovered = Object.keys(process.env)
    .filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name))
    .sort();
  const seenNames = new Set();
  const seenValues = new Set();
  const candidates = [];
  for (const name of [...preferred, ...discovered]) {
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const value = text(process.env[name]);
    if (!value || seenValues.has(value)) continue;
    seenValues.add(value);
    candidates.push({ name, value });
  }
  return candidates;
}

async function resolveManagementCredential() {
  const candidates = managementCredentialCandidates();
  if (!candidates.length) {
    throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_GOVERNED_TRAINER_PROVISION");
  }
  const rejected = [];
  for (const candidate of candidates) {
    const response = await fetch(`${REST_BASE}/networkvolumes`, {
      headers: {
        Authorization: `Bearer ${candidate.value}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      const volumes = await readJson(
        response,
        "AVANTIQO_INTELLIGENCE_TRAINER_GOVERNED_PROVISION_VOLUME_PROBE",
      );
      if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
      return {
        credential: candidate.value,
        source: candidate.name,
        candidate_count: candidates.length,
        volumes,
      };
    }
    if ([401, 403].includes(response.status)) {
      rejected.push(response.status);
      await response.text().catch(() => "");
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_GOVERNED_PROVISION_VOLUME_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejected.join(",") || "NONE"}`,
  );
}

function runScript(script, args = [], env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function parseJsonOutput(output) {
  const raw = text(output, 200_000);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function recoveryProbe() {
  const result = runScript(RECOVERY_SCRIPT);
  const body = parseJsonOutput(result.stdout);
  const stderr = text(result.stderr, 12_000);
  const exactMissingEndpoint =
    result.status !== 0 &&
    /AVANTIQO_INTELLIGENCE_TRAINER_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=0/.test(stderr);
  return { result, body, stderr, exactMissingEndpoint };
}

function printChild(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function adoptVerifiedExistingTrainer() {
  const result = runScript(
    RECOVERY_SCRIPT,
    ["--adopt"],
    {
      ...process.env,
      AVANTIQO_INTELLIGENCE_TRAINER_LOCAL_BINDING_ADOPT_APPROVED: "YES",
    },
  );
  printChild(result);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_EXISTING_RECOVERY_ADOPT_FAILED:exit=${result.status}`,
    );
  }
}

const localEnv = loadRelevantLocalEnv();
const apply = process.argv.includes("--apply");
const management = await resolveManagementCredential();
const exactVolumes = management.volumes.filter(
  (volume) => text(volume?.name) === CANONICAL_VOLUME_NAME,
);
if (exactVolumes.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_TRAINER_CANONICAL_SHARED_VOLUME_REQUIRED:matches=${exactVolumes.length}`,
  );
}
const volume = exactVolumes[0];
const volumeSizeGb = finite(volume?.size ?? volume?.sizeGb, 0);
const volumeId = text(volume?.id);
const dataCenterId = text(volume?.dataCenterId);
if (!volumeId || !dataCenterId) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_SHARED_VOLUME_IDENTITY_REQUIRED");
}

const gate = {
  success: volumeSizeGb >= REQUIRED_VOLUME_SIZE_GB,
  contract: CONTRACT,
  mode: apply ? "APPLY_GATE" : "PLAN_GATE",
  local_env: localEnv,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_volume_list: true,
    value_exposed: false,
  },
  volume: {
    id: volumeId,
    name: CANONICAL_VOLUME_NAME,
    data_center_id: dataCenterId,
    current_size_gb: volumeSizeGb,
    required_size_gb: REQUIRED_VOLUME_SIZE_GB,
    capacity_gate_passed: volumeSizeGb >= REQUIRED_VOLUME_SIZE_GB,
  },
  delegated_core_script: CORE_SCRIPT,
  recovery_script: RECOVERY_SCRIPT,
  next_action:
    volumeSizeGb >= REQUIRED_VOLUME_SIZE_GB
      ? apply
        ? "VERIFY_OR_PROVISION_ZERO_SCALE_TRAINER"
        : "VERIFY_OR_PLAN_ZERO_SCALE_TRAINER"
      : "EXPAND_INTELLIGENCE_CODE_SHARED_VOLUME_TO_160_GB_FIRST",
  governance: {
    volume_mutated: false,
    endpoint_mutated_by_gate: false,
    template_mutated_by_gate: false,
    provider_job_submitted_by_gate: false,
    training_started_by_gate: false,
    production_web_deploy: false,
    secret_values_printed: false,
  },
};

if (!gate.success) {
  console.log(JSON.stringify(gate, null, 2));
  process.exit(2);
}

console.log(JSON.stringify(gate, null, 2));

const before = recoveryProbe();
if (before.result.error) throw before.result.error;
if (before.result.status === 0 && before.body?.success === true) {
  if (apply) {
    adoptVerifiedExistingTrainer();
  } else {
    if (before.result.stdout) process.stdout.write(before.result.stdout);
    if (before.result.stderr) process.stderr.write(before.result.stderr);
  }
  process.exit(0);
}
if (
  !before.exactMissingEndpoint &&
  (before.body?.success === false || before.result.status !== 0)
) {
  printChild(before.result);
  throw new Error(
    "AVANTIQO_INTELLIGENCE_TRAINER_EXISTING_STATE_REPAIR_REQUIRED_DO_NOT_CREATE_DUPLICATE",
  );
}

const child = runScript(CORE_SCRIPT, apply ? ["--apply"] : []);
if (child.error) throw child.error;
if (child.status === 0) {
  printChild(child);
  if (apply) adoptVerifiedExistingTrainer();
  process.exit(0);
}

if (!apply) {
  printChild(child);
  throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_CORE_PROVISION_FAILED:exit=${child.status}`);
}

const after = recoveryProbe();
if (after.result.error) throw after.result.error;
if (after.result.status === 0 && after.body?.success === true) {
  console.log(
    "AVANTIQO_INTELLIGENCE_TRAINER_CORE_VERIFY_FALSE_NEGATIVE_RECOVERED=true",
  );
  adoptVerifiedExistingTrainer();
  process.exit(0);
}

printChild(child);
printChild(after.result);
throw new Error(
  `AVANTIQO_INTELLIGENCE_TRAINER_CORE_PROVISION_FAILED_AND_RECOVERY_UNVERIFIED:exit=${child.status}`,
);
