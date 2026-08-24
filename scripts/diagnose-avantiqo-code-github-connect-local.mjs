import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_GITHUB_CONNECT_DIAGNOSTIC_V1";
const CONNECT_API = "https://api.vercel.com/v1/connect/token";
const DEFAULT_CONNECTOR = "github/avantiqo-code";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decodeJwtPayload(token) {
  const parts = text(token).split(".");
  if (parts.length < 2) return {};
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return object(JSON.parse(Buffer.from(padded, "base64").toString("utf8")));
  } catch {
    return {};
  }
}

function sanitized(value, depth = 0) {
  if (depth > 5) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => sanitized(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(token|secret|authorization|credential|cookie|password|key)/i.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitized(item, depth + 1);
  }
  return result;
}

async function localProject() {
  try {
    const parsed = JSON.parse(await readFile(".vercel/project.json", "utf8"));
    return {
      linked: true,
      project_id: text(parsed?.projectId) || null,
      team_id: text(parsed?.orgId) || null,
      project_name: text(parsed?.projectName) || null,
    };
  } catch (error) {
    return {
      linked: false,
      project_id: null,
      team_id: null,
      project_name: null,
      error: text(error?.code || error?.message || error),
    };
  }
}

function classification(status, body) {
  const source = JSON.stringify(body || {}).toLowerCase();
  if (status >= 200 && status < 300) return "TOKEN_EXCHANGE_AVAILABLE";
  if (status === 401) return "OIDC_TOKEN_INVALID_OR_EXPIRED";
  if (status === 404) return "CONNECTOR_NOT_FOUND_OR_NOT_VISIBLE_TO_PROJECT";
  if (status === 403) {
    if (source.includes("attach") || source.includes("project") || source.includes("access")) {
      return "CONNECTOR_PROJECT_LINK_REQUIRED";
    }
    if (source.includes("install") || source.includes("authorization") || source.includes("authorize")) {
      return "GITHUB_CONNECTOR_APP_INSTALLATION_OR_AUTHORIZATION_REQUIRED";
    }
    return "CONNECTOR_PROJECT_LINK_OR_APP_INSTALLATION_REQUIRED";
  }
  return `CONNECT_TOKEN_HTTP_${status || "UNKNOWN"}`;
}

const connector = text(process.env.AVANTIQO_CODE_GITHUB_CONNECTOR) || DEFAULT_CONNECTOR;
const oidcToken = text(process.env.VERCEL_OIDC_TOKEN);
if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN_REQUIRED");

const project = await localProject();
const claims = decodeJwtPayload(oidcToken);
const safeClaims = {
  issuer: text(claims.iss) || null,
  subject: text(claims.sub) || null,
  audience: claims.aud || null,
  project_id: text(claims.project_id || claims.projectId) || null,
  project_name: text(claims.project_name || claims.projectName) || null,
  owner_id: text(claims.owner_id || claims.ownerId) || null,
  environment: text(claims.environment) || null,
  git_ref: text(claims.git_ref || claims.gitRef) || null,
  issued_at: Number.isFinite(Number(claims.iat)) ? Number(claims.iat) : null,
  expires_at: Number.isFinite(Number(claims.exp)) ? Number(claims.exp) : null,
};

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
  body = raw ? { raw: raw.slice(0, 1200) } : null;
}

const diagnostic = {
  success: response.ok,
  contract: CONTRACT,
  connector,
  token_exchange_http_status: response.status,
  classification: classification(response.status, body),
  local_project: project,
  oidc_claims: safeClaims,
  project_binding_consistent: Boolean(
    project.linked &&
    (!safeClaims.project_id || !project.project_id || safeClaims.project_id === project.project_id) &&
    (!safeClaims.owner_id || !project.team_id || safeClaims.owner_id === project.team_id)
  ),
  connect_response: sanitized(body),
  access_token_returned: Boolean(response.ok && text(body?.token)),
  token_value_logged: false,
  github_write_performed: false,
  connector_mutation_performed: false,
  production_deploy_performed: false,
  next_actions: response.ok
    ? ["RERUN_GOVERNED_GITHUB_LIVE_CERTIFICATION"]
    : response.status === 403
      ? [
          `RUN: vercel connect list --format=json`,
          `IF_CONNECTOR_EXISTS_ATTACH_DEVELOPMENT: vercel connect attach ${connector} --project ${project.project_id || "<linked-project>"} --environment development`,
          `IF_APP_NOT_INSTALLED_AUTHORIZE: vercel connect token ${connector} --subject app --yes`,
        ]
      : response.status === 404
        ? [
            "RUN: vercel connect list --format=json",
            "CREATE_OR_SELECT_THE_EXACT_GITHUB_CONNECTOR_BEFORE_RETRY",
          ]
        : ["INSPECT_CONNECT_RESPONSE_AND_REPAIR_EXACT_AUTHORIZATION_BLOCKER"],
};

console.log(JSON.stringify(diagnostic, null, 2));
if (!response.ok) process.exitCode = 2;
