import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createConnection, createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RUN_V2";
const PLATFORM_ORG_NAME = "Avantiqo Platform";
const PLATFORM_ORG_TYPE = "enterprise_group";
const PLATFORM_ORG_STATUS = "active";
const PLATFORM_ORG_LIFECYCLE = "ACTIVE";
const ROUTE_PATH = "/api/internal/intelligence/continuous-learning/process?limit=1";
const SCOPES = Object.freeze([
  "platform_learning_agenda",
  "platform_learning_evidence_candidates",
  "platform_knowledge",
  "platform_learning_runs",
  "platform_training_candidates",
]);
const NEXT_START_TIMEOUT_MS = 90_000;
const RESEARCH_TIMEOUT_MS = 600_000;
const RESEARCH_RESPONSE_LIMIT = 2_000_000;
const CHILD_TAIL_LIMIT = 12_000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function required(name) {
  const value = text(process.env[name], 20_000);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assertNode20Plus() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isInteger(major) || major < 20) {
    throw new Error(`AVANTIQO_CONTINUOUS_LEARNING_LOCAL_NODE_20_PLUS_REQUIRED:current=${process.versions.node}`);
  }
}

function redact(value, secrets = []) {
  let output = String(value ?? "");
  for (const secret of secrets) {
    const needle = String(secret ?? "");
    if (!needle) continue;
    output = output.split(needle).join("[REDACTED]");
  }
  return output;
}

function appendTail(current, chunk, secrets) {
  const next = `${current}${redact(chunk, secrets)}`;
  return next.length <= CHILD_TAIL_LIMIT ? next : next.slice(-CHILD_TAIL_LIMIT);
}

async function readJson(response, label, secrets = []) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = redact(
      text(body?.error || body?.message || body?.detail || raw, 1600),
      secrets,
    );
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    error.responseBody = body;
    throw error;
  }
  return body ?? {};
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabaseRestBase = `${supabaseUrl}/rest/v1`;
const staticSecrets = [serviceRoleKey];

async function supabaseGet(table, params, { count = false } = {}) {
  const search = new URLSearchParams(params);
  const response = await fetch(`${supabaseRestBase}/${table}?${search}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      ...(count ? { Prefer: "count=exact", Range: "0-0" } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(
    response,
    "AVANTIQO_CONTINUOUS_LEARNING_LOCAL_SUPABASE",
    staticSecrets,
  );
  if (!count) return body;
  const contentRange = text(response.headers.get("content-range"), 200);
  const totalRaw = contentRange.includes("/") ? contentRange.split("/").pop() : "";
  const total = Number(totalRaw);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error(
      `AVANTIQO_CONTINUOUS_LEARNING_LOCAL_COUNT_INVALID:${contentRange || "MISSING_CONTENT_RANGE"}`,
    );
  }
  return { body, count: total };
}

async function resolvePlatformOrganization() {
  const rows = await supabaseGet("organizations", {
    select: "id,name,organization_type,status,organization_status",
    name: `eq.${PLATFORM_ORG_NAME}`,
    organization_type: `eq.${PLATFORM_ORG_TYPE}`,
    status: `eq.${PLATFORM_ORG_STATUS}`,
    organization_status: `eq.${PLATFORM_ORG_LIFECYCLE}`,
    limit: "2",
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(
      `AVANTIQO_CONTINUOUS_LEARNING_PLATFORM_ORG_RESOLUTION_FAILED:matches=${Array.isArray(rows) ? rows.length : 0}`,
    );
  }
  const organization = rows[0];
  const id = text(organization?.id, 160);
  if (!id || text(organization?.name) !== PLATFORM_ORG_NAME) {
    throw new Error("AVANTIQO_CONTINUOUS_LEARNING_PLATFORM_ORG_IDENTITY_INVALID");
  }
  const configured = text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
  if (configured && configured !== id) {
    throw new Error(
      "AVANTIQO_CONTINUOUS_LEARNING_LOCAL_CONFIGURED_ORG_MISMATCH_PLATFORM_ORG",
    );
  }
  return {
    id,
    name: PLATFORM_ORG_NAME,
    organization_type: text(organization?.organization_type),
    status: text(organization?.status),
    organization_status: text(organization?.organization_status),
  };
}

async function countScope(organizationId, scope) {
  const result = await supabaseGet(
    "intelligence_memories",
    {
      select: "id",
      organization_id: `eq.${organizationId}`,
      memory_scope: `eq.${scope}`,
      active: "eq.true",
    },
    { count: true },
  );
  return result.count;
}

async function snapshotCounts(organizationId) {
  return Object.fromEntries(
    await Promise.all(
      SCOPES.map(async (scope) => [scope, await countScope(organizationId, scope)]),
    ),
  );
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_FREE_PORT_FAILED"));
        else resolve(port);
      });
    });
  });
}

async function waitForTcp(port, child, timeoutMs = NEXT_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `AVANTIQO_CONTINUOUS_LEARNING_LOCAL_NEXT_EXITED_EARLY:exit=${child.exitCode}`,
      );
    }
    const connected = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(800, () => finish(false));
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`AVANTIQO_CONTINUOUS_LEARNING_LOCAL_NEXT_START_TIMEOUT:${timeoutMs}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
  ]);
  if (!exited && child.exitCode === null) child.kill("SIGKILL");
}

function sanitizeResultEntry(entry = {}) {
  const source = object(entry);
  return {
    status: text(source.status, 120) || null,
    topic_key: text(source.topic_key || source.topicKey || source.subject, 240) || null,
    knowledge_domain:
      text(source.knowledge_domain || source.domain || source.knowledgeDomain, 240) || null,
    claim_count: Number.isFinite(Number(source.claim_count ?? source.claimCount))
      ? Number(source.claim_count ?? source.claimCount)
      : null,
    evidence_candidate_count: Number.isFinite(
      Number(source.evidence_candidate_count ?? source.evidenceCandidateCount),
    )
      ? Number(source.evidence_candidate_count ?? source.evidenceCandidateCount)
      : null,
    reusable_platform_knowledge_written:
      source.reusable_platform_knowledge_written === true,
    prior_released_knowledge_retired:
      source.prior_released_knowledge_retired === true,
    source_count: Number.isFinite(Number(source.source_count ?? source.sourceCount))
      ? Number(source.source_count ?? source.sourceCount)
      : null,
    follow_up_topics_enqueued: Number.isFinite(
      Number(source.follow_up_topics_enqueued ?? source.followUpTopicsEnqueued),
    )
      ? Number(source.follow_up_topics_enqueued ?? source.followUpTopicsEnqueued)
      : null,
    error: text(source.error || source.failure, 1000) || null,
  };
}

function sanitizeBatch(body, httpStatus) {
  const root = object(body);
  const source = object(root.result || root.data || root);
  const rawResults = list(source.results || source.processed || root.results);
  const processedCountCandidate =
    source.processed_count ?? source.processedCount ?? source.processed?.length ?? rawResults.length;
  const failedCountCandidate =
    source.failed_count ?? source.failedCount ?? source.failed?.length ?? 0;
  return {
    http_status: httpStatus,
    success: root.success !== false && source.success !== false,
    status: text(source.status || root.status, 120) || null,
    processed_count: Number.isFinite(Number(processedCountCandidate))
      ? Number(processedCountCandidate)
      : null,
    failed_count: Number.isFinite(Number(failedCountCandidate))
      ? Number(failedCountCandidate)
      : null,
    seeded_topics: Number.isFinite(Number(source.seeded_topics ?? source.seededTopics))
      ? Number(source.seeded_topics ?? source.seededTopics)
      : null,
    results: rawResults.slice(0, 4).map(sanitizeResultEntry),
    error: text(root.error || source.error || root.message, 1200) || null,
  };
}

async function invokeOneResearch(port, cronSecret) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let raw = "";
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      callback(value);
    };
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: ROUTE_PATH,
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          Accept: "application/json",
          Connection: "close",
        },
      },
      (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > RESEARCH_RESPONSE_LIMIT) {
            request.destroy(
              new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RESEARCH_RESPONSE_TOO_LARGE"),
            );
          }
        });
        response.once("aborted", () => {
          finish(
            reject,
            new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RESEARCH_RESPONSE_ABORTED"),
          );
        });
        response.once("error", (error) => finish(reject, error));
        response.once("end", () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = { success: false, error: "NON_JSON_RESPONSE" };
          }
          const status = Number(response.statusCode || 0);
          finish(resolve, {
            ok: status >= 200 && status < 300,
            status,
            sanitized: sanitizeBatch(body, status),
          });
        });
      },
    );
    const overallTimer = setTimeout(() => {
      request.destroy(
        new Error(
          `AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RESEARCH_TIMEOUT:${RESEARCH_TIMEOUT_MS}`,
        ),
      );
    }, RESEARCH_TIMEOUT_MS);
    request.once("error", (error) => finish(reject, error));
    request.end();
  });
}

assertNode20Plus();
const run = process.argv.includes("--run");
if (run && !yes(process.env.AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RUN_APPROVED)) {
  throw new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RUN_APPROVED=YES_REQUIRED");
}

const organization = await resolvePlatformOrganization();
const countsBefore = await snapshotCounts(organization.id);
if (countsBefore.platform_learning_agenda < 1) {
  throw new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_PLATFORM_AGENDA_REQUIRED");
}

const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
const plan = {
  success: true,
  contract: CONTRACT,
  mode: run ? "RUN_ONE_TOPIC" : "PLAN",
  organization,
  counts_before: countsBefore,
  execution: {
    route: ROUTE_PATH,
    maximum_research_topics: 1,
    local_next_server_only: true,
    public_evidence_research_only: true,
    local_client_timeout_ms: RESEARCH_TIMEOUT_MS,
    runpod_used: false,
    owned_model_inference_used: false,
    gpu_training_used: false,
  },
  scope_protection: {
    platform_organization_only: true,
    customer_organization_used: false,
    customer_private_memory_allowed: false,
    evidence_candidate_creation_allowed: true,
    reusable_platform_knowledge_creation_allowed: false,
    training_candidate_creation_requested: false,
    model_training_requested: false,
  },
  governance: {
    explicit_one_topic_research_approval_required: true,
    production_deploy: false,
    runpod_access: false,
    provider_training_job_submitted: false,
    gpu_job_submitted: false,
    training_started: false,
    reusable_platform_knowledge_release_requested: false,
    customer_memory_touched: false,
    platform_org_only: true,
    provider_research_executions_max: run ? 1 : 0,
    secrets_in_output: false,
  },
  next_action: run
    ? "START_ISOLATED_LOCAL_SERVER_AND_STAGE_ONE_PLATFORM_EVIDENCE_CANDIDATE_BATCH"
    : "APPROVE_ONE_LOCAL_PLATFORM_EVIDENCE_RESEARCH_TOPIC",
};

if (!run) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
if (!existsSync(nextBin)) {
  throw new Error("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_NEXT_RUNTIME_REQUIRED");
}

const port = await freePort();
const cronSecret = text(process.env.CRON_SECRET, 20_000) || randomBytes(32).toString("hex");
const secrets = [...staticSecrets, cronSecret];
let stdoutTail = "";
let stderrTail = "";
let child = null;
let research = null;
let countsAfter = null;
let executionError = null;

try {
  child = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
        AVANTIQO_CONTINUOUS_LEARNING_ENABLED: "true",
        AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID: organization.id,
        CRON_SECRET: cronSecret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => {
    stdoutTail = appendTail(stdoutTail, chunk, secrets);
  });
  child.stderr?.on("data", (chunk) => {
    stderrTail = appendTail(stderrTail, chunk, secrets);
  });

  await waitForTcp(port, child);
  research = await invokeOneResearch(port, cronSecret);
  countsAfter = await snapshotCounts(organization.id);
  if (!research.ok || research.sanitized.success === false) {
    executionError = `AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RESEARCH_FAILED:http=${research.status}`;
  }
} catch (error) {
  const causeCode = text(error?.cause?.code || error?.code, 160);
  const causeMessage = text(error?.cause?.message, 700);
  executionError = redact(
    [
      text(error?.message || error, 1200),
      causeCode ? `cause_code=${causeCode}` : "",
      causeMessage ? `cause=${causeMessage}` : "",
    ]
      .filter(Boolean)
      .join(":"),
    secrets,
  );
  countsAfter = await snapshotCounts(organization.id).catch(() => null);
} finally {
  await stopChild(child);
}

const knowledgeBefore = Number(countsBefore.platform_knowledge || 0);
const knowledgeAfter = Number(countsAfter?.platform_knowledge || 0);
const platformKnowledgeUnchanged = knowledgeAfter === knowledgeBefore;
const evidenceCandidateBefore = Number(countsBefore.platform_learning_evidence_candidates || 0);
const evidenceCandidateAfter = Number(countsAfter?.platform_learning_evidence_candidates || 0);
const evidenceCandidateIncreased = evidenceCandidateAfter > evidenceCandidateBefore;
const learningRunIncreased =
  Number(countsAfter?.platform_learning_runs || 0) >
  Number(countsBefore.platform_learning_runs || 0);

if (!executionError && !platformKnowledgeUnchanged) {
  executionError = `AVANTIQO_CONTINUOUS_LEARNING_LOCAL_UNEXPECTED_PLATFORM_KNOWLEDGE_MUTATION:before=${knowledgeBefore}:after=${knowledgeAfter}`;
}

const report = {
  ...plan,
  success: !executionError,
  mode: "RUN_ONE_TOPIC",
  local_server: {
    started: Boolean(child),
    stopped: true,
    isolated_loopback: true,
    port_exposed_in_output: false,
  },
  research: research?.sanitized || {
    http_status: null,
    success: false,
    status: null,
    processed_count: null,
    failed_count: null,
    seeded_topics: null,
    results: [],
    error: executionError || "NO_RESEARCH_RESULT",
  },
  counts_after: countsAfter,
  evidence: {
    platform_knowledge_count_unchanged: platformKnowledgeUnchanged,
    platform_knowledge_count_increased: knowledgeAfter > knowledgeBefore,
    evidence_candidate_count_increased: evidenceCandidateIncreased,
    platform_learning_run_count_increased: learningRunIncreased,
    customer_memory_touched: false,
    runpod_used: false,
  },
  next_action: executionError
    ? "REPAIR_CONTINUOUS_LEARNING_EVIDENCE_STAGING_RUNTIME"
    : evidenceCandidateIncreased
      ? "REVIEW_STAGED_EVIDENCE_CANDIDATES_THROUGH_EPISTEMIC_PIPELINE"
      : "NO_NEW_EVIDENCE_CANDIDATE_STAGED",
  governance: {
    ...plan.governance,
    provider_research_executions_max: 1,
    provider_training_job_submitted: false,
    gpu_job_submitted: false,
    training_started: false,
    production_deploy: false,
    runpod_access: false,
    reusable_platform_knowledge_written: false,
    prior_released_knowledge_retired: false,
    automatic_knowledge_promotion: false,
    customer_memory_touched: false,
    platform_org_only: true,
    secrets_in_output: false,
  },
};

if (executionError) {
  report.error = executionError;
  report.local_server_diagnostics = {
    stdout_tail: redact(stdoutTail, secrets).slice(-4000) || null,
    stderr_tail: redact(stderrTail, secrets).slice(-4000) || null,
  };
}

console.log(JSON.stringify(report, null, 2));
if (executionError) process.exit(2);
