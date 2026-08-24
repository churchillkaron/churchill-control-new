import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_GITHUB_CONNECT_SETUP_V2";
const APPROVAL = "AVANTIQO_CODE_GITHUB_CONNECT_SETUP_APPROVED";
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_CONNECT_SETUP_OUTPUT ||
    "/tmp/avantiqo-code-github-connect-setup.json",
);
const TEMP_VERCEL_ENV = resolve(
  process.env.AVANTIQO_CODE_GITHUB_CONNECT_SETUP_VERCEL_ENV_OUTPUT ||
    `/tmp/avantiqo-code-github-connect-${process.pid}.env`,
);
const CONNECT_API = "https://api.vercel.com/v1/connect/token";
const DESIRED_NAME = "avantiqo-code";

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return text(value).toUpperCase() === "YES";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function runCapture(command, args, { env = process.env } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      resolveRun({
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

function runInteractive(command, args, { env = process.env } = {}) {
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

function parseJsonOutput(raw) {
  const source = text(raw);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {}
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  return null;
}

function normalizeListResponse(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return null;
  for (const key of ["connectors", "data", "items", "results", "result"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeListResponse(value[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function safeConnector(value) {
  const item = object(value);
  const uid = text(item.uid || item.slug || item.connectorUid || item.connector_uid);
  const id = text(item.id || item.connectorId || item.connector_id);
  const name = text(item.name || item.displayName || item.display_name);
  const service = text(item.service || item.provider || item.type || item.target);
  return {
    uid: uid || null,
    id: id || null,
    name: name || null,
    service: service || null,
  };
}

function githubConnectors(value) {
  const rows = normalizeListResponse(value) || [];
  return rows
    .map(safeConnector)
    .filter((item) =>
      [item.uid, item.id, item.name, item.service]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes("github"),
    );
}

function connectorIdentifier(item) {
  return text(item?.uid || item?.id);
}

function selectConnector(connectors) {
  const exact = connectors.filter((item) => {
    const uid = text(item.uid).toLowerCase();
    const name = text(item.name).toLowerCase();
    return uid === `github/${DESIRED_NAME}` || name === DESIRED_NAME;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error("AVANTIQO_CODE_GITHUB_CONNECT_MULTIPLE_EXACT_CONNECTORS");
  }
  if (connectors.length === 1) return connectors[0];
  if (connectors.length > 1) {
    const labels = connectors.map((item) => connectorIdentifier(item) || item.name || "UNKNOWN");
    throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_AMBIGUOUS:${labels.join(",")}`);
  }
  return null;
}

async function linkedProject() {
  const parsed = JSON.parse(await readFile(".vercel/project.json", "utf8"));
  const projectId = text(parsed?.projectId);
  const teamId = text(parsed?.orgId);
  const projectName = text(parsed?.projectName);
  if (!projectId || !teamId) {
    throw new Error("AVANTIQO_CODE_GITHUB_CONNECT_LINKED_PROJECT_REQUIRED");
  }
  return {
    project_id: projectId,
    team_id: teamId,
    project_name: projectName || null,
  };
}

async function resolveConnectLauncher() {
  const globalProbe = await runCapture("vercel", ["connect", "--help"]).catch((error) => ({
    code: 1,
    signal: null,
    stdout: "",
    stderr: text(error?.message || error),
  }));
  if (globalProbe.code === 0) {
    return {
      command: "vercel",
      prefix: [],
      source: "installed_vercel_cli",
    };
  }

  const latestProbe = await runCapture("npx", ["--yes", "vercel@latest", "connect", "--help"]).catch((error) => ({
    code: 1,
    signal: null,
    stdout: "",
    stderr: text(error?.message || error),
  }));
  if (latestProbe.code !== 0) {
    throw new Error(
      `AVANTIQO_CODE_GITHUB_CONNECT_LATEST_CLI_REQUIRED:${text(latestProbe.stderr || latestProbe.stdout).slice(0, 500)}`,
    );
  }
  return {
    command: "npx",
    prefix: ["--yes", "vercel@latest"],
    source: "npx_vercel_latest",
  };
}

async function connectCapture(launcher, args) {
  return runCapture(launcher.command, [...launcher.prefix, "connect", ...args]);
}

async function connectInteractive(launcher, args) {
  return runInteractive(launcher.command, [...launcher.prefix, "connect", ...args]);
}

async function listConnectors(launcher) {
  const result = await connectCapture(launcher, ["list", "--format=json"]);
  if (result.signal) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_LIST_SIGNAL:${result.signal}`);
  if (result.code !== 0) {
    throw new Error(
      `AVANTIQO_CODE_GITHUB_CONNECT_LIST_FAILED:${result.code}:${text(result.stderr || result.stdout).slice(0, 700)}`,
    );
  }
  const parsed = parseJsonOutput(result.stdout);
  if (!parsed) throw new Error("AVANTIQO_CODE_GITHUB_CONNECT_LIST_JSON_INVALID");
  return githubConnectors(parsed);
}

async function createGitHubConnector(launcher) {
  const result = await connectInteractive(launcher, [
    "create",
    "github",
    "--name",
    DESIRED_NAME,
    "--yes",
  ]);
  if (result.signal) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_CREATE_SIGNAL:${result.signal}`);
  return {
    success: result.code === 0,
    exit_code: result.code,
  };
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

async function projectOidcToken() {
  await unlink(TEMP_VERCEL_ENV).catch(() => null);
  const result = await runInteractive("vercel", [
    "env",
    "pull",
    TEMP_VERCEL_ENV,
    "--environment=development",
    "--yes",
  ]);
  if (result.signal) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_ENV_PULL_SIGNAL:${result.signal}`);
  if (result.code !== 0) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_ENV_PULL_FAILED:${result.code}`);
  const source = await readFile(TEMP_VERCEL_ENV, "utf8");
  const token = envFileValue(source, "VERCEL_OIDC_TOKEN");
  if (!token) throw new Error("AVANTIQO_CODE_GITHUB_CONNECT_OIDC_TOKEN_MISSING");
  return token;
}

async function tokenExchange(connector, oidcToken) {
  const response = await fetch(`${CONNECT_API}/${encodeURIComponent(connector)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ subject: { type: "app" } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw ? { message: raw.slice(0, 700) } : null;
  }
  return {
    ok: response.ok && Boolean(text(body?.token)),
    status: response.status,
    code: text(body?.error?.code || body?.code) || null,
    message: text(body?.error?.message || body?.message || body?.error) || null,
  };
}

async function attachDevelopment(launcher, connector, project) {
  const result = await connectInteractive(launcher, [
    "attach",
    connector,
    "--project",
    project.project_id,
    "--environment",
    "development",
  ]);
  if (result.signal) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_ATTACH_SIGNAL:${result.signal}`);
  if (result.code !== 0) throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_ATTACH_FAILED:${result.code}`);
}

if (!yes(process.env[APPROVAL])) {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const project = await linkedProject();
const launcher = await resolveConnectLauncher();
let connectors = await listConnectors(launcher);
let connector = selectConnector(connectors);
let connectorCreated = false;
let connectorCreationAttempted = false;
let connectorCreationRecoveredAfterNonzero = false;
let connectorCreateExitCode = null;
let developmentAttachPerformed = false;

if (!connector) {
  connectorCreationAttempted = true;
  const creation = await createGitHubConnector(launcher);
  connectorCreateExitCode = creation.exit_code;
  connectors = await listConnectors(launcher);
  connector = selectConnector(connectors);
  if (!connector) {
    throw new Error(`AVANTIQO_CODE_GITHUB_CONNECT_CREATE_NOT_RECOVERED:${creation.exit_code}`);
  }
  connectorCreated = creation.success;
  connectorCreationRecoveredAfterNonzero = !creation.success;
}

const connectorId = connectorIdentifier(connector);
if (!connectorId) throw new Error("AVANTIQO_CODE_GITHUB_CONNECT_IDENTIFIER_MISSING");

let oidcToken;
let exchange;
try {
  oidcToken = await projectOidcToken();
  exchange = await tokenExchange(connectorId, oidcToken);
  if (!exchange.ok && [403, 404].includes(exchange.status)) {
    await attachDevelopment(launcher, connectorId, project);
    developmentAttachPerformed = true;
    oidcToken = await projectOidcToken();
    exchange = await tokenExchange(connectorId, oidcToken);
  }
} finally {
  oidcToken = "";
  await unlink(TEMP_VERCEL_ENV).catch(() => null);
}

if (!exchange?.ok) {
  throw new Error(
    `AVANTIQO_CODE_GITHUB_CONNECT_TOKEN_EXCHANGE_FAILED:${exchange?.status || "UNKNOWN"}:${exchange?.code || "NO_CODE"}:${exchange?.message || "NO_MESSAGE"}`,
  );
}

const result = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  connector: connectorId,
  connector_name: connector.name,
  connector_service: connector.service,
  connector_created: connectorCreated,
  connector_creation_attempted: connectorCreationAttempted,
  connector_create_exit_code: connectorCreateExitCode,
  connector_creation_recovered_after_nonzero: connectorCreationRecoveredAfterNonzero,
  connect_cli_source: launcher.source,
  linked_vercel_project: project,
  development_attach_performed: developmentAttachPerformed,
  development_access_verified: true,
  app_token_exchange_verified: true,
  token_value_logged: false,
  env_local_modified: false,
  temporary_vercel_env_deleted: true,
  production_environment_attached: false,
  github_write_performed: false,
  production_deploy_performed: false,
};

await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: OUTPUT,
  connector: result.connector,
  connector_created: result.connector_created,
  connector_creation_attempted: result.connector_creation_attempted,
  connector_create_exit_code: result.connector_create_exit_code,
  connector_creation_recovered_after_nonzero: result.connector_creation_recovered_after_nonzero,
  connect_cli_source: result.connect_cli_source,
  development_attach_performed: result.development_attach_performed,
  app_token_exchange_verified: true,
  token_value_logged: false,
  production_environment_attached: false,
  github_write_performed: false,
  production_deploy_performed: false,
}, null, 2));
