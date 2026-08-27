import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_CONCURRENCY_GUARD_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_EXPECTED_MAIN";
const RUNPOD_REST_ORIGIN = "https://rest.runpod.io";
const TEMPLATE_COLLECTION_URL = `${RUNPOD_REST_ORIGIN}/v1/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`;
const CRITICAL_PATHS = [
  "scripts/provision-avantiqo-intelligence-deep-eager-candidate-local.mjs",
  "scripts/provision-avantiqo-intelligence-deep-eager-candidate-v2-local.mjs",
  "scripts/run-avantiqo-intelligence-deep-eager-candidate-probe-local.mjs",
  "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  "config/avantiqo-runpod-safe-lease-policy.json",
];

const text = (value) => String(value ?? "").trim();

function runGit(args, code, { allowStatus = [] } = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && !allowStatus.includes(result.status)) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 900)}`);
  }
  return result;
}

function collectionRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["templates", "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

const expected = text(process.env[EXPECTED_MAIN_ENV]);
if (expected) {
  if (!/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }

  const branch = text(runGit(["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`).stdout);
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }

  runGit(["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  runGit(["cat-file", "-e", `${expected}^{commit}`], `${CONTRACT}_EXPECTED_COMMIT_MISSING`);
  const remote = text(runGit(["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`).stdout);

  if (remote !== expected) {
    const ancestry = runGit(
      ["merge-base", "--is-ancestor", expected, remote],
      `${CONTRACT}_ANCESTRY_CHECK_FAILED`,
      { allowStatus: [1] },
    );
    if (ancestry.status !== 0) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_NOT_ANCESTOR:expected=${expected}:actual=${remote}`);
    }

    const changed = text(
      runGit(
        ["diff", "--name-only", expected, remote, "--", ...CRITICAL_PATHS],
        `${CONTRACT}_CRITICAL_DIFF_FAILED`,
      ).stdout,
    )
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (changed.length) {
      throw new Error(
        `${CONTRACT}_CRITICAL_PATH_CHANGED:expected=${expected}:actual=${remote}:paths=${changed.join(",")}`,
      );
    }

    console.log(`${CONTRACT}_UNRELATED_MAIN_ADVANCE_ALLOWED=${JSON.stringify({
      pinned_main: expected,
      observed_main: remote,
      critical_paths_changed: false,
    })}`);
  }

  // Keep V2 pinned to the newest main revision that this guard actually
  // observed. If main moves again after this point, V2's own fresh-main checks
  // fail closed before candidate mutation instead of silently accepting a
  // second concurrent advance.
  process.env[EXPECTED_MAIN_ENV] = remote;
}

// RunPod exposes some endpoint-bound templates in the templates collection
// while GET /templates/{id} returns 404. V2 deliberately resolves templates by
// exact bound template ID, so normalize only that live API shape: on an
// item-route 404, resolve the same exact ID from the endpoint-bound collection.
// Every other response and request passes through unchanged.
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const rawUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : text(input?.url);

  const response = await nativeFetch(input, init);
  if (response.status !== 404 || !rawUrl) return response;

  let parsed;
  try { parsed = new URL(rawUrl); } catch { return response; }
  if (parsed.origin !== RUNPOD_REST_ORIGIN) return response;

  const match = parsed.pathname.match(/^\/v1\/templates\/([^/]+)$/);
  if (!match) return response;

  const templateId = decodeURIComponent(match[1]);
  if (!templateId) return response;

  const collectionResponse = await nativeFetch(TEMPLATE_COLLECTION_URL, {
    method: "GET",
    headers: init?.headers,
    signal: init?.signal,
  });
  if (!collectionResponse.ok) return response;

  let payload = null;
  try { payload = await collectionResponse.json(); } catch { return response; }
  const matches = collectionRows(payload).filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) return response;

  console.log(`${CONTRACT}_ENDPOINT_BOUND_TEMPLATE_COLLECTION_FALLBACK=USED`);
  return new Response(JSON.stringify(matches[0]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

// V2 verifies candidate/deep runtime parity by exact bound template ID and the
// shim above makes endpoint-bound collection records available to that verifier
// without weakening any parity or mutation checks.
await import("./provision-avantiqo-intelligence-deep-eager-candidate-v2-local.mjs");
