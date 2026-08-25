import process from "node:process";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_SAFE_CERTIFICATION_RUNNER_V1";
const ORGANIZATION_NAME = "Avantiqo Code Planner Certification";
const SERVICE_ID = "ai.code.debug";

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
    throw new Error(`CODE_AI_CERTIFICATION_CHILD_FAILED:${command}:${args.join(" ")}:${result.status}`);
  }
  return capture ? text(result.stdout) : "";
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("CODE_AI_CERTIFICATION_BOOTSTRAP_JSON_REQUIRED");
  }
  return JSON.parse(output.slice(start, end + 1));
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_CERTIFICATION_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_PLANNER_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PLANNER_SPEND_APPROVAL_REQUIRED");
}

const existingCertification = spawnSync(
  "pgrep",
  ["-f", "certify-code-ai-autonomous-planner-service-runtime-live.mjs"],
  { encoding: "utf8" },
);
if (existingCertification.status === 0 && text(existingCertification.stdout)) {
  throw new Error("CODE_AI_CERTIFICATION_ALREADY_RUNNING");
}

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

let organizationId = null;
let serviceEnabled = false;
let certificationSucceeded = false;

async function resolveCertificationOrganization() {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", ORGANIZATION_NAME);
  if (error) throw error;
  if ((data || []).length > 1) {
    throw new Error("CODE_AI_CERTIFICATION_ORGANIZATION_AMBIGUOUS");
  }
  return data?.[0]?.id || null;
}

async function disableCertificationService() {
  const resolvedOrganizationId = organizationId || await resolveCertificationOrganization();
  if (!resolvedOrganizationId) return false;

  const { data, error } = await supabase
    .from("organization_services")
    .update({ usage_enabled: false })
    .eq("organization_id", resolvedOrganizationId)
    .eq("service_id", SERVICE_ID)
    .select("usage_enabled")
    .maybeSingle();
  if (error) throw error;
  if (data && data.usage_enabled !== false) {
    throw new Error("CODE_AI_CERTIFICATION_SERVICE_DISABLE_FAILED");
  }
  serviceEnabled = false;
  return Boolean(data);
}

try {
  await disableCertificationService();

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_SOURCE_AUDIT_START",
    contract: CONTRACT,
    service_usage_enabled: false,
    provider_spend_approved: true,
  }));
  run("npm", ["run", "audit:code-ai-autonomy"]);

  const bootstrapOutput = run(
    process.execPath,
    ["scripts/bootstrap-code-ai-planner-certification-local.mjs"],
    { capture: true },
  );
  process.stdout.write(`${bootstrapOutput}\n`);
  const bootstrap = parseJsonOutput(bootstrapOutput);
  organizationId = text(bootstrap.organization_id);
  if (!organizationId) {
    throw new Error("CODE_AI_CERTIFICATION_BOOTSTRAP_ORGANIZATION_REQUIRED");
  }
  if (bootstrap?.service?.usage_enabled !== true) {
    throw new Error("CODE_AI_CERTIFICATION_BOOTSTRAP_SERVICE_ENABLE_REQUIRED");
  }
  if (Number(bootstrap?.wallet?.reserved_balance || 0) !== 0) {
    throw new Error("CODE_AI_CERTIFICATION_BOOTSTRAP_RESERVED_BALANCE_MUST_BE_ZERO");
  }
  serviceEnabled = true;

  const certificationEnv = {
    ...process.env,
    AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID: organizationId,
  };
  run("npm", ["run", "certify:code-ai-autonomous-planner"], {
    env: certificationEnv,
  });
  certificationSucceeded = true;
} finally {
  let disabled = false;
  try {
    disabled = await disableCertificationService();
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_CERTIFICATION_CLEANUP_FAILED",
      contract: CONTRACT,
      organization_id: organizationId,
      reason: text(error?.message || error),
      service_may_remain_enabled: serviceEnabled,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    throw error;
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_SERVICE_DISABLED",
    contract: CONTRACT,
    organization_id: organizationId,
    service_id: SERVICE_ID,
    service_disabled: disabled,
    certification_succeeded: certificationSucceeded,
    new_provider_execution_outside_certification: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
}
