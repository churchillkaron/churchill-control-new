import nextEnv from "@next/env";
import {
  execFile,
  execFileSync,
  spawn,
} from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ENV_PATH = ".env.local";
const META_SYSTEM_USERS_URL =
  "https://business.facebook.com/settings/system-users";
const REQUIRED_PERMISSIONS = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_manage_ads",
  "pages_read_engagement",
  "pages_show_list",
];

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clipboardValue() {
  try {
    return text(execFileSync("pbpaste", [], { encoding: "utf8" }));
  } catch {
    throw new Error("Mac clipboard command pbpaste is unavailable");
  }
}

function clearClipboard() {
  try {
    execFileSync("pbcopy", [], {
      encoding: "utf8",
      input: "",
    });
  } catch {
    // Clipboard clearing is best-effort after the secret is saved.
  }
}

function tokenCandidate(value) {
  const candidate = text(value);
  return (
    candidate.length >= 80 &&
    candidate.length <= 4096 &&
    !/\s/.test(candidate) &&
    !candidate.toUpperCase().includes("YOUR_")
  );
}

function graphError(payload, status) {
  const error = payload?.error || {};
  return [
    error.error_user_msg || error.message || `HTTP ${status}`,
    error.code !== undefined ? `code=${error.code}` : null,
    error.error_subcode !== undefined
      ? `subcode=${error.error_subcode}`
      : null,
    error.type ? `type=${error.type}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function graphGet(path, token, params = {}) {
  const url = new URL(
    `https://graph.facebook.com/${String(path).replace(/^\//, "")}`,
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const effectiveVersion =
    response.headers.get("facebook-api-version") ||
    response.headers.get("x-fb-api-version") ||
    null;

  if (!response.ok || payload?.error) {
    throw new Error(graphError(payload, response.status));
  }

  return {
    payload,
    effectiveVersion,
  };
}

async function validateSystemUserToken(token) {
  const identity = await graphGet("me", token, {
    fields: "id,name",
  });
  const permissionsResult = await graphGet("me/permissions", token);
  const adAccountsResult = await graphGet("me/adaccounts", token, {
    fields: "id,name,account_id,account_status,currency,timezone_name,business",
    limit: "100",
  });

  const permissions = new Map(
    (Array.isArray(permissionsResult.payload?.data)
      ? permissionsResult.payload.data
      : []
    ).map((row) => [text(row.permission), text(row.status).toLowerCase()]),
  );
  const missingPermissions = REQUIRED_PERMISSIONS.filter(
    (permission) => permissions.get(permission) !== "granted",
  );

  if (missingPermissions.length) {
    throw new Error(
      `Token is missing granted permissions: ${missingPermissions.join(", ")}`,
    );
  }

  const accounts = Array.isArray(adAccountsResult.payload?.data)
    ? adAccountsResult.payload.data
    : [];

  if (!accounts.length) {
    throw new Error(
      "Token has no accessible ad account. Assign the Churchill ad account to the Avantiqo system user before generating the token.",
    );
  }

  if (accounts.length > 1) {
    const options = accounts
      .map(
        (account) =>
          `${account.id || account.account_id || "unknown"}:${account.name || "unnamed"}`,
      )
      .join(", ");
    throw new Error(
      `Token has access to multiple ad accounts. Leave only one assigned before continuing: ${options}`,
    );
  }

  const account = accounts[0];
  const effectiveVersion =
    adAccountsResult.effectiveVersion ||
    permissionsResult.effectiveVersion ||
    identity.effectiveVersion;

  if (!effectiveVersion) {
    throw new Error("Meta did not report the effective Graph API version");
  }
  if (!account?.id || !account?.currency) {
    throw new Error("Meta returned an incomplete assigned ad account");
  }

  return {
    identity: {
      id: identity.payload?.id || null,
      name: identity.payload?.name || null,
    },
    account,
    effectiveVersion,
  };
}

function serializeEnvValue(value) {
  return text(value).replace(/[\r\n]/g, "");
}

function updateEnvFile(values) {
  const existing = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : "";
  const keys = new Set(Object.keys(values));
  const keptLines = existing
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      return !match || !keys.has(match[1]);
    });

  while (keptLines.length && keptLines.at(-1) === "") {
    keptLines.pop();
  }

  const next = [
    ...keptLines,
    keptLines.length ? "" : null,
    "# Avantiqo managed Meta Ads runtime",
    ...Object.entries(values).map(
      ([key, value]) => `${key}=${serializeEnvValue(value)}`,
    ),
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  writeFileSync(ENV_PATH, next, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(ENV_PATH, 0o600);
}

async function tryValidatedToken(candidate, source) {
  if (!tokenCandidate(candidate)) return null;

  console.log(`CLIPBOARD_TOKEN_DETECTED=${source}`);

  try {
    const validation = await validateSystemUserToken(candidate);
    return {
      token: candidate,
      validation,
    };
  } catch (error) {
    console.log(
      `CLIPBOARD_TOKEN_REJECTED=${error?.message || String(error)}`,
    );
    return null;
  }
}

async function waitForValidatedClipboardToken(initialClipboard) {
  const initialResult = await tryValidatedToken(
    initialClipboard,
    "ALREADY_PRESENT",
  );
  if (initialResult) return initialResult;

  const timeoutAt = Date.now() + 10 * 60 * 1000;
  const startedAt = Date.now();
  let lastCandidate = initialClipboard;
  let lastError = null;
  let lastHeartbeatSecond = -1;

  while (Date.now() < timeoutAt) {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);

    if (
      elapsedSeconds === 0 ||
      (elapsedSeconds % 10 === 0 && elapsedSeconds !== lastHeartbeatSecond)
    ) {
      lastHeartbeatSecond = elapsedSeconds;
      console.log(`WAITING_FOR_META_TOKEN_COPY=${elapsedSeconds}s`);
    }

    const current = clipboardValue();

    if (current !== lastCandidate && tokenCandidate(current)) {
      lastCandidate = current;
      console.log("CLIPBOARD_TOKEN_DETECTED=NEW_COPY");

      try {
        const validation = await validateSystemUserToken(current);
        return {
          token: current,
          validation,
        };
      } catch (error) {
        lastError = error?.message || String(error);
        console.log(`CLIPBOARD_TOKEN_REJECTED=${lastError}`);
        console.log("Waiting for a newly generated token to be copied...");
      }
    }

    await sleep(1000);
  }

  throw new Error(
    lastError
      ? `Timed out waiting for a valid copied Meta token. Last validation error: ${lastError}`
      : "Timed out waiting for a Meta system-user token to be copied",
  );
}

async function runBootstrap(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/bootstrap-managed-meta-ads.mjs"],
      {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Bootstrap terminated by ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Bootstrap exited with status ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function openMetaSystemUsers() {
  try {
    await execFileAsync("open", ["-a", "Safari", META_SYSTEM_USERS_URL]);
    return "SAFARI";
  } catch {
    try {
      await execFileAsync("open", [META_SYSTEM_USERS_URL]);
      return "DEFAULT_BROWSER";
    } catch {
      return "FAILED";
    }
  }
}

async function main() {
  console.log("SCRIPT_STARTED=YES");

  const organizationId = required("ORGANIZATION_ID");
  const initialClipboard = clipboardValue();

  console.log("MANAGED_META_ADS_BROWSER_SETUP");
  console.log("DATABASE_CHANGES=NO");
  console.log("CAMPAIGN_CREATED=NO");
  console.log("TOKEN_PRINTED=NO");

  const openedWith = await openMetaSystemUsers();
  console.log(`META_SYSTEM_USERS_OPENED=${openedWith}`);
  console.log(`META_SYSTEM_USERS_URL=${META_SYSTEM_USERS_URL}`);

  console.log("");
  console.log("In Meta, select the Avantiqo system user and click:");
  console.log("Generate token -> Churchill marketing fa/inst -> select the requested permissions -> Generate -> Copy");
  console.log("This script is waiting for the copied token. Do not paste it into Terminal.");

  const { token, validation } = await waitForValidatedClipboardToken(
    initialClipboard,
  );

  updateEnvFile({
    META_GRAPH_API_VERSION: validation.effectiveVersion,
    AVANTIQO_META_ACCESS_TOKEN: token,
    AVANTIQO_META_AD_ACCOUNT_ID: validation.account.id,
  });
  clearClipboard();

  console.log("META_SYSTEM_USER_TOKEN_VALID=YES");
  console.log(`META_GRAPH_API_VERSION=${validation.effectiveVersion}`);
  console.log(`META_AD_ACCOUNT_ID=${validation.account.id}`);
  console.log(`META_AD_ACCOUNT_NAME=${validation.account.name || ""}`);
  console.log(`META_AD_ACCOUNT_CURRENCY=${validation.account.currency}`);
  console.log("TOKEN_SAVED_TO_ENV_LOCAL=YES");
  console.log("CLIPBOARD_CLEARED=YES");
  console.log("TOKEN_PRINTED=NO");

  const environment = {
    ...process.env,
    ORGANIZATION_ID: organizationId,
    META_GRAPH_API_VERSION: validation.effectiveVersion,
    AVANTIQO_META_ACCESS_TOKEN: token,
    AVANTIQO_META_AD_ACCOUNT_ID: validation.account.id,
  };
  delete environment.APPLY;

  await runBootstrap(environment);
}

main().catch((error) => {
  console.error("MANAGED_META_ADS_BROWSER_SETUP=FAIL");
  console.error(`ERROR=${error?.message || String(error)}`);
  process.exit(1);
});
