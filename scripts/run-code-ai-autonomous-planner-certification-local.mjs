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
const PROVIDER = "avantiqo-code";
const REQUIRED_NODE_MAJOR = 24;
const RESERVATION_EPSILON = 0.000001;
const THIS_SCRIPT = fileURLToPath(import.meta.url);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sameAmount(left, right) {
  return Math.abs(finite(left) - finite(right)) <= RESERVATION_EPSILON;
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

async function reconcilePendingCertificationReservation() {
  const resolvedOrganizationId = organizationId || await resolveCertificationOrganization();
  if (!resolvedOrganizationId) return false;

  const { data: wallet, error: walletError } = await supabase
    .from("organization_wallets")
    .select("id,currency,reserved_balance")
    .eq("organization_id", resolvedOrganizationId)
    .maybeSingle();
  if (walletError) throw walletError;
  if (!wallet) return false;

  const walletReserved = finite(wallet.reserved_balance);
  if (walletReserved <= RESERVATION_EPSILON) return false;

  const { data: organizationService, error: serviceError } = await supabase
    .from("organization_services")
    .select("id,managed_by,usage_enabled,billing_enabled,default_provider_id")
    .eq("organization_id", resolvedOrganizationId)
    .eq("service_id", SERVICE_ID)
    .maybeSingle();
  if (serviceError) throw serviceError;
  if (!organizationService) {
    throw new Error("CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_SERVICE_REQUIRED");
  }
  if (organizationService.managed_by !== "AVANTIQO_CERTIFICATION") {
    throw new Error("CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_SERVICE_SCOPE_UNSAFE");
  }
  if (organizationService.usage_enabled !== false || organizationService.billing_enabled !== false) {
    throw new Error("CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_REQUIRES_DISABLED_SERVICE");
  }
  if (text(organizationService.default_provider_id) !== PROVIDER) {
    throw new Error("CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_PROVIDER_SCOPE_UNSAFE");
  }

  const { data: pendingUsages, error: pendingError } = await supabase
    .from("platform_service_usage")
    .select("id,provider,capability,provider_request_id,status,currency,metadata,created_at")
    .eq("organization_id", resolvedOrganizationId)
    .eq("status", "PENDING")
    .eq("provider", PROVIDER)
    .eq("capability", SERVICE_ID)
    .order("created_at", { ascending: false });
  if (pendingError) throw pendingError;

  const candidates = (pendingUsages || []).filter((usage) => {
    const reserved = finite(usage?.metadata?.reservation_pricing?.customer_price);
    return Boolean(text(usage?.provider_request_id)) && reserved > RESERVATION_EPSILON;
  });

  if (candidates.length !== 1) {
    throw new Error(
      `CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_EXACT_USAGE_REQUIRED:${candidates.length}:${walletReserved}`,
    );
  }

  const target = candidates[0];
  const reservationAmount = finite(target?.metadata?.reservation_pricing?.customer_price);
  if (!sameAmount(walletReserved, reservationAmount)) {
    throw new Error(
      `CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_WALLET_SCOPE_UNSAFE:${walletReserved}:${reservationAmount}`,
    );
  }

  const providerJobId = text(target.provider_request_id);
  if (!providerJobId) {
    throw new Error("CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_PROVIDER_JOB_REQUIRED");
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_PENDING_SETTLEMENT_START",
    contract: CONTRACT,
    organization_id: resolvedOrganizationId,
    usage_id: target.id,
    provider_job_id: providerJobId,
    wallet_reserved_before: walletReserved,
    reservation_amount: reservationAmount,
    service_usage_enabled: false,
    service_billing_enabled: false,
    new_provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  run(
    process.execPath,
    ["scripts/settle-code-ai-planner-certification-pending-local.mjs"],
    {
      env: {
        ...process.env,
        AVANTIQO_CODE_PLANNER_PENDING_SETTLEMENT_APPROVED: "YES",
        AVANTIQO_CODE_PLANNER_PENDING_USAGE_ID: text(target.id),
        AVANTIQO_CODE_PLANNER_PENDING_PROVIDER_JOB_ID: providerJobId,
      },
    },
  );

  const { data: walletAfter, error: walletAfterError } = await supabase
    .from("organization_wallets")
    .select("reserved_balance")
    .eq("organization_id", resolvedOrganizationId)
    .single();
  if (walletAfterError) throw walletAfterError;

  const walletReservedAfter = finite(walletAfter?.reserved_balance);
  if (walletReservedAfter > RESERVATION_EPSILON) {
    throw new Error(
      `CODE_AI_CERTIFICATION_PENDING_SETTLEMENT_RESERVED_BALANCE_REMAINS:${walletReservedAfter}`,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_PENDING_SETTLEMENT_COMPLETE",
    contract: CONTRACT,
    organization_id: resolvedOrganizationId,
    usage_id: target.id,
    provider_job_id: providerJobId,
    wallet_reserved_after: walletReservedAfter,
    service_usage_enabled: false,
    service_billing_enabled: false,
    new_provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  return true;
}

try {
  await disableCertificationService();
  await reconcilePendingCertificationReservation();

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
