import crypto from "node:crypto";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_SAFE_RUNNER_V1";
const SERVICE_ID = "ai.code.debug";
const REQUIRED_NODE_MAJOR = 24;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`CODE_AI_EMPLOYEE_CERT_CHILD_FAILED:${command}:${args.join(" ")}:${result.status}`);
  }
  return capture ? text(result.stdout) : "";
}

function parseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("CODE_AI_EMPLOYEE_CERT_BOOTSTRAP_JSON_REQUIRED");
  }
  return JSON.parse(output.slice(start, end + 1));
}

const nodeMajor = Number(String(process.versions.node || "").split(".")[0]);
if (nodeMajor !== REQUIRED_NODE_MAJOR) {
  throw new Error(`CODE_AI_EMPLOYEE_CERT_NODE_24_REQUIRED:current=${process.version}`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_EMPLOYEE_CERT_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVAL_REQUIRED");
}

const currentHead = text(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(currentHead)) {
  throw new Error("CODE_AI_EMPLOYEE_CERT_LOCAL_HEAD_INVALID");
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_EMPLOYEE_CERT_ZERO_SPEND_AUDIT_START",
  contract: CONTRACT,
  current_head: currentHead,
  node_runtime: process.version,
  provider_spend_performed: false,
  runpod_worker_created: false,
}));
run("npm", ["run", "audit:code-ai-autonomy"]);

const bootstrapOutput = run(
  process.execPath,
  ["scripts/bootstrap-code-ai-planner-certification-local.mjs"],
  { capture: true },
);
process.stdout.write(`${bootstrapOutput}\n`);
const bootstrap = parseJson(bootstrapOutput);
const organizationId = text(bootstrap.organization_id);
if (!organizationId) throw new Error("CODE_AI_EMPLOYEE_CERT_BOOTSTRAP_ORGANIZATION_REQUIRED");
if (bootstrap?.service?.usage_enabled !== true || bootstrap?.service?.billing_enabled !== true) {
  throw new Error("CODE_AI_EMPLOYEE_CERT_BOOTSTRAP_SERVICE_ENABLE_REQUIRED");
}
if (Number(bootstrap?.wallet?.reserved_balance || 0) !== 0) {
  throw new Error("CODE_AI_EMPLOYEE_CERT_BOOTSTRAP_RESERVED_BALANCE_MUST_BE_ZERO");
}

const workerSecret = crypto.randomBytes(32).toString("hex");
const certificationEnv = {
  ...process.env,
  AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_SESSION_SECRET: workerSecret,
  AVANTIQO_CODE_WORKER_SESSION_ENABLED: "true",
  AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: currentHead,
  AVANTIQO_CODE_ENGINE_ENABLED: "true",
};

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

let succeeded = false;
try {
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_EMPLOYEE_CERT_PREFLIGHT_START",
    contract: CONTRACT,
    organization_id: organizationId,
    current_head: currentHead,
    worker_session_enabled: true,
    worker_session_secret_generated_ephemerally: true,
    provider_spend_performed: false,
    runpod_worker_created: false,
    secrets_printed: false,
  }));
  run(process.execPath, ["scripts/preflight-code-ai-employee-service-runtime-local.mjs"], {
    env: certificationEnv,
  });

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_EMPLOYEE_CERT_LIVE_START",
    contract: CONTRACT,
    organization_id: organizationId,
    reasoning_call_budget: 4,
    warm_worker_idle_ms: 600000,
    expected_main_commit: currentHead,
    explicit_spend_approved: true,
    secrets_printed: false,
  }));
  run(process.execPath, ["scripts/certify-code-ai-employee-fast-start-live.mjs"], {
    env: certificationEnv,
  });
  succeeded = true;
} finally {
  const disabled = await supabase
    .from("organization_services")
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", organizationId)
    .eq("service_id", SERVICE_ID)
    .select("id,usage_enabled,billing_enabled")
    .maybeSingle();
  if (disabled.error) {
    console.error(`AVANTIQO_CODE_EMPLOYEE_CERT_RUNNER_SERVICE_DISABLE_FAILED:${disabled.error.message}`);
    if (succeeded) throw disabled.error;
  }
  if (disabled.data && (disabled.data.usage_enabled !== false || disabled.data.billing_enabled !== false)) {
    const error = new Error("AVANTIQO_CODE_EMPLOYEE_CERT_RUNNER_SERVICE_DISABLE_NOT_VERIFIED");
    if (succeeded) throw error;
    console.error(error.message);
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  current_head: currentHead,
  organization_id: organizationId,
  audit_passed_before_spend: true,
  preflight_passed_before_spend: true,
  reasoning_call_budget: 4,
  worker_secret_persisted: false,
  production_deploy_performed: false,
  github_commit_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
