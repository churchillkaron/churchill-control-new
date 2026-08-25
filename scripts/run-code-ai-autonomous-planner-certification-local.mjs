import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_SAFE_CERTIFICATION_RUNNER_V1";
const ORGANIZATION_NAME = "Avantiqo Code Planner Certification";
const SERVICE_ID = "ai.code.debug";
const REQUIRED_NODE_MAJOR = 24;
const THIS_SCRIPT = fileURLToPath(import.meta.url);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function nodeMajor(version) {
  const major = Number(String(version || "").replace(/^v/, "").split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function nodeVersion(candidate) {
  if (!candidate) return null;
  const result = spawnSync(candidate, ["-p", "process.versions.node"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return null;
  return text(result.stdout);
}

function versionedNodeCandidates(root, relativeNodePath) {
  if (!root || !fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root)
      .filter((entry) => /^v?24(?:\.|$)/.test(entry))
      .map((entry) => path.join(root, entry, ...relativeNodePath));
  } catch {
    return [];
  }
}

function node24Candidates() {
  const home = os.homedir();
  const candidates = [
    text(process.env.AVANTIQO_NODE24_BIN),
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ];

  for (const directory of text(process.env.PATH).split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, "node"));
  }

  const nvmRoots = [
    text(process.env.NVM_DIR),
    path.join(home, ".nvm"),
  ].filter(Boolean);
  for (const root of new Set(nvmRoots)) {
    candidates.push(...versionedNodeCandidates(
      path.join(root, "versions", "node"),
      ["bin", "node"],
    ));
  }

  const fnmRoots = [
    path.join(home, ".fnm", "node-versions"),
    path.join(home, ".local", "share", "fnm", "node-versions"),
  ];
  for (const root of fnmRoots) {
    candidates.push(...versionedNodeCandidates(
      root,
      ["installation", "bin", "node"],
    ));
  }

  candidates.push(...versionedNodeCandidates(
    path.join(home, ".volta", "tools", "image", "node"),
    ["bin", "node"],
  ));

  return [...new Set(candidates.filter(Boolean))];
}

function ensureNode24Runtime() {
  if (nodeMajor(process.versions.node) === REQUIRED_NODE_MAJOR) return;

  if (process.env.AVANTIQO_CODE_CERT_NODE24_REEXEC === "1") {
    throw new Error(`CODE_AI_CERTIFICATION_NODE_24_REEXEC_FAILED:current=${process.version}`);
  }

  const compatibleNode = node24Candidates().find(
    (candidate) => nodeMajor(nodeVersion(candidate)) === REQUIRED_NODE_MAJOR,
  );
  if (!compatibleNode) {
    throw new Error(
      `CODE_AI_CERTIFICATION_NODE_24_REQUIRED:current=${process.version}:set_AVANTIQO_NODE24_BIN_or_activate_Node_24`,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_NODE_RUNTIME_REEXEC",
    contract: CONTRACT,
    current_node: process.version,
    required_node_major: REQUIRED_NODE_MAJOR,
    compatible_node_found: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  const relaunched = spawnSync(
    compatibleNode,
    [THIS_SCRIPT, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AVANTIQO_CODE_CERT_NODE24_REEXEC: "1",
      },
      stdio: "inherit",
    },
  );
  if (relaunched.error) throw relaunched.error;
  process.exit(Number.isInteger(relaunched.status) ? relaunched.status : 1);
}

ensureNode24Runtime();

function node24ChildEnv(env = process.env) {
  return {
    ...env,
    PATH: [path.dirname(process.execPath), text(env.PATH)]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: node24ChildEnv(env),
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

const { createClient } = await import("@supabase/supabase-js");
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
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", resolvedOrganizationId)
    .eq("service_id", SERVICE_ID)
    .select("usage_enabled,billing_enabled")
    .maybeSingle();
  if (error) throw error;
  if (data && (data.usage_enabled !== false || data.billing_enabled !== false)) {
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
    node_runtime: process.version,
    service_usage_enabled: false,
    service_billing_enabled: false,
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
  if (
    bootstrap?.service?.usage_enabled !== true ||
    bootstrap?.service?.billing_enabled !== true
  ) {
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
    node_runtime: process.version,
    service_disabled: disabled,
    usage_enabled: false,
    billing_enabled: false,
    certification_succeeded: certificationSucceeded,
    new_provider_execution_outside_certification: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
}
