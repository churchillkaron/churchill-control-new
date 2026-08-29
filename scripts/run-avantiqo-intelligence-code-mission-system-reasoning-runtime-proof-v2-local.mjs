import { createHash } from "node:crypto";
import https from "node:https";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
  avantiqoCodeMissionSystemReasoningSystemPrompt,
  buildAvantiqoCodeMissionSystemReasoningEnvelope,
  finalizeAvantiqoIntelligenceCodeMissionSystemReasoning,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js";

const CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_RUNTIME_PROOF_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const EXPECTED_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const REPOSITORY_URL =
  "https://github.com/churchillkaron/churchill-control-new.git";
const RESPONSE_TIMEOUT_MS = 600_000;
const HEALTH_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 8192;
const OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_PROOF_OUTPUT ||
    "/tmp/avantiqo-intelligence-code-mission-system-reasoning-runtime-proof-v2.json",
);

const MISSION = Object.freeze({
  id: "general-intelligence-system-reasoning-runtime-proof-v2",
  objective: [
    "Evaluate how Avantiqo should carry significant cross-system architecture and impact context from General Intelligence into Code Intelligence",
    "while preserving verified Self-Learning boundaries, current-repository authority, batched Code work packages, deterministic verification, and one governed implementation plan.",
    "Reuse existing shared contracts where current-main evidence supports them and do not create a second planner, memory system, impact engine, or coding agent.",
  ].join(" "),
  business_intent:
    "Prove that owned Deep General Intelligence can return a complete architecture decision product that the canonical Code mission contract accepts without General performing implementation.",
});

const EVIDENCE = Object.freeze([
  [
    "lib/intelligence/runtime/AvantiqoProductConstitution.js",
    "AVANTIQO_PRODUCT_CONSTITUTION_V1",
  ],
  [
    "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js",
    "AVANTIQO_INTELLIGENCE_CODE_MISSION_V1",
  ],
  [
    "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js",
    "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1",
  ],
  [
    "lib/intelligence/runtime/AvantiqoCodeMissionLearningIngressRuntime.js",
    "AVANTIQO_CODE_MISSION_LEARNING_INGRESS_V1",
  ],
  [
    "lib/code/runtime/CodeAIWorkPackageRuntime.js",
    "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
  ],
]);

const LIST_KEYS = Object.freeze([
  "reasoning_scope",
  "future_predictable_requirements",
  "affected_domains",
  "affected_capabilities",
  "shared_primitives",
  "data_lifecycle_implications",
  "security_permissions",
  "business_accounting_invariants",
  "integration_implications",
  "backward_compatibility",
  "performance_implications",
  "reporting_analytics_implications",
  "automation_ai_hooks",
  "expensive_to_change_decisions",
  "invariants",
  "completion_criteria",
  "verification_requirements",
]);

function text(value, limit = 12_000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
    text(value, 40).toUpperCase(),
  );
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}
function redact(value) {
  return text(value, 1800)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 200_000);
}
function requireApprovalAndLease() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_PROOF_APPROVED)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_PROOF_APPROVED=YES_REQUIRED",
    );
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_LANE_MISMATCH`);
  }
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 240);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 240);
  if (!leasedEndpointId || !configuredEndpointId || leasedEndpointId !== configuredEndpointId) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_MISMATCH`);
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 360_000) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_EXPIRY_INSUFFICIENT`);
  }
  return {
    endpoint_id: leasedEndpointId,
    expires_at: new Date(expiresAt).toISOString(),
  };
}
function validatePinnedMain() {
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  const expected = text(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_PROOF_EXPECTED_MAIN_COMMIT,
    160,
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  }
  if (head !== expected) {
    throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
  }
  const tracked = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    `${CONTRACT}_GIT_STATUS_FAILED`,
  );
  if (tracked) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  const trackedFileCount = shell(
    "git",
    ["ls-files"],
    `${CONTRACT}_GIT_LS_FILES_FAILED`,
  ).split("\n").filter(Boolean).length;
  return { head, tracked_file_count: trackedFileCount };
}
async function repositoryAssessment(repository) {
  const evidenceFiles = [];
  for (const [filePath, expectedToken] of EVIDENCE) {
    const content = await readFile(resolve(filePath), "utf8");
    if (!content.includes(expectedToken)) {
      throw new Error(`${CONTRACT}_EVIDENCE_TOKEN_MISSING:${filePath}:${expectedToken}`);
    }
    const lines = content.split("\n");
    evidenceFiles.push({
      file_path: filePath,
      found: true,
      start_line: 1,
      end_line: Math.min(lines.length, 120),
      total_lines: lines.length,
      discovery_queries: [expectedToken],
      discovery_sources: ["PINNED_CURRENT_MAIN_PROOF"],
      content: lines.slice(0, 120).join("\n"),
    });
  }
  return {
    contract: "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
    status: "PINNED_CURRENT_MAIN_PROOF_EVIDENCE_READY",
    repository_snapshot: {
      repository_url: REPOSITORY_URL,
      ref: "main",
      current_main_head: repository.head,
      generated_at: new Date().toISOString(),
      clean_checkout: true,
      tracked_file_count: repository.tracked_file_count,
      requested_focus: MISSION.objective,
      bounded_repository_evidence: true,
      dynamic_repository_evidence: false,
      cross_surface_repository_evidence: true,
      full_repository_certification: false,
      evidence_files: evidenceFiles,
      dynamic_evidence_expansion: { files: [] },
    },
    assessment: {
      executive_summary:
        "Pinned current-main evidence confirms the shared Product Constitution, canonical Intelligence-to-Code mission, General system-reasoning adapter, guarded Code-to-Learning ingress, and batched Code work-package contract.",
      repository_observations: EVIDENCE.map(([filePath, token]) => `${filePath} contains ${token}.`),
      gaps: [
        "This is bounded proof evidence, not full repository certification.",
        "Code must refetch and inspect newest main before mutation.",
      ],
      engineering_objective:
        "Evidence-only assessment objective. It is intentionally different from and subordinate to the actual mission objective.",
      completion_criteria: ["The actual mission objective remains authoritative."],
    },
    objective_selection: {
      selected_objective:
        "Evidence-only assessment objective. It must not replace the actual mission.",
      selected_evidence_paths: EVIDENCE.map(([filePath]) => filePath),
      selected_completion_criteria: ["Bounded evidence does not authorize implementation."],
    },
    evidence_limits: [
      "Only listed files are supplied as current-main evidence.",
      "No database read, build, E2E, deployment, or source mutation is performed.",
    ],
  };
}
function nativeJsonRequest(url, apiKey, { method = "GET", body = null, timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const payload = body ? JSON.stringify(body) : "";
    const target = new URL(url);
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    const request = https.request(target, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(payload ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        } : {}),
      },
    }, (response) => {
      let raw = "";
      let bytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error(`${CONTRACT}_RESPONSE_TOO_LARGE`));
          return;
        }
        raw += chunk;
      });
      response.on("end", () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        const status = Number(response.statusCode || 0);
        if (status < 200 || status >= 300) {
          finish(rejectPromise, new Error(`${CONTRACT}_HTTP_${status}:${redact(parsed?.error?.message || parsed?.message || raw)}`));
          return;
        }
        if (!parsed || typeof parsed !== "object") {
          finish(rejectPromise, new Error(`${CONTRACT}_INVALID_JSON_RESPONSE`));
          return;
        }
        finish(resolvePromise, parsed);
      });
    });
    request.on("error", (error) => {
      finish(rejectPromise, new Error(`${CONTRACT}_NATIVE_HTTPS_FAILED:${redact(error?.message)}`));
    });
    timer = setTimeout(() => {
      request.destroy(new Error(`${CONTRACT}_NATIVE_HTTPS_DEADLINE_EXCEEDED:${timeoutMs}`));
    }, timeoutMs);
    if (payload) request.write(payload);
    request.end();
  });
}
function healthJobs(body = {}) {
  const jobs = body?.jobs || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}
function completionText(body = {}) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : text(part?.text, 20_000)).filter(Boolean).join("\n").trim();
  }
  return "";
}
function parseJsonObject(value) {
  const source = text(value, 200_000).replace(/^\uFEFF/, "");
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}
function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => text(typeof entry === "string" ? entry : JSON.stringify(entry), 4000)).filter(Boolean);
  }
  if (typeof value === "string" && text(value)) return [text(value, 4000)];
  if (value && typeof value === "object") return [text(JSON.stringify(value), 4000)];
  return [];
}
function normalizeDecisionProduct(value) {
  const source = object(value?.system_reasoning || value);
  const normalized = { ...source };
  for (const key of LIST_KEYS) normalized[key] = normalizeListValue(source[key]);
  normalized.architecture_recommendation = text(source.architecture_recommendation, 12_000);
  normalized.impact_graph = object(source.impact_graph);
  normalized.domain_ownership = source.domain_ownership ?? [];
  normalized.api_contracts = source.api_contracts ?? [];
  normalized.risks = source.risks ?? [];
  return normalized;
}
function reasoningTransportDetected(body = {}) {
  const message = body?.choices?.[0]?.message || {};
  return Boolean(text(message.reasoning_content || message.reasoning, 1));
}
function validateFinalized(result, repository) {
  if (result?.contract !== AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT) {
    throw new Error(`${CONTRACT}_FINAL_CONTRACT_INVALID`);
  }
  if (result?.status !== "READY_FOR_CODE") throw new Error(`${CONTRACT}_READY_FOR_CODE_REQUIRED`);
  if (result?.mission_context?.mission?.objective !== MISSION.objective) {
    throw new Error(`${CONTRACT}_MISSION_OBJECTIVE_NOT_PRESERVED`);
  }
  if (result?.mission_context?.repository_context?.head_sha !== repository.head) {
    throw new Error(`${CONTRACT}_REPOSITORY_HEAD_NOT_PRESERVED`);
  }
  const reasoning = object(result?.mission_context?.system_reasoning);
  if (!text(reasoning.architecture_recommendation)) throw new Error(`${CONTRACT}_ARCHITECTURE_REQUIRED`);
  if (!Object.keys(object(reasoning.impact_graph)).length) throw new Error(`${CONTRACT}_IMPACT_GRAPH_REQUIRED`);
  for (const key of ["invariants", "completion_criteria", "verification_requirements"]) {
    if (!Array.isArray(reasoning[key]) || reasoning[key].length === 0) {
      throw new Error(`${CONTRACT}_${key.toUpperCase()}_REQUIRED`);
    }
  }
  const governance = object(result.governance);
  if (
    governance.code_execution_started !== false ||
    governance.source_mutation_performed !== false ||
    governance.database_mutation_performed !== false ||
    governance.deployment_performed !== false ||
    governance.knowledge_promotion_performed !== false ||
    governance.raw_reasoning_persisted !== false ||
    governance.repository_assessment_selected_objective_replaced_mission !== false
  ) {
    throw new Error(`${CONTRACT}_GOVERNANCE_INVALID`);
  }
  return reasoning;
}

console.log(`${CONTRACT}_MODE=PINNED_MAIN_DIRECT_DEEP_CONTRACT_BOUNDARY`);
console.log(`${CONTRACT}_MODELS_WARMUP_REQUEST_PERFORMED=false`);
console.log(`${CONTRACT}_SERVICE_EXECUTION_RUNTIME_BYPASSED=true`);
console.log(`${CONTRACT}_DATABASE_MUTATION=false`);
console.log(`${CONTRACT}_WALLET_MUTATION=false`);
console.log(`${CONTRACT}_CODE_EXECUTION=false`);
console.log(`${CONTRACT}_KNOWLEDGE_PROMOTION=false`);

const lease = requireApprovalAndLease();
const repository = validatePinnedMain();
const assessment = await repositoryAssessment(repository);
const learnedKnowledge = {
  evaluated: true,
  status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
  knowledge: [],
  provenance_contracts: [],
  freshness_checked: true,
  evidence_graph_checked: true,
  fresh_research_performed: false,
};
const canonicalContext = {
  proof_scope: "GENERAL_INTELLIGENCE_DEEP_MODEL_CANONICAL_MISSION_BOUNDARY_V2",
  code_implementation_authorized: false,
  future_proof_architecture_not_feature_count: true,
};
const envelope = buildAvantiqoCodeMissionSystemReasoningEnvelope({
  mission: MISSION,
  learned_knowledge: learnedKnowledge,
  canonical_context: canonicalContext,
  repository_assessment: assessment,
});

const apiKey =
  text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12_000) ||
  text(process.env.RUNPOD_API_KEY, 12_000) ||
  text(process.env.RUNPOD_MANAGEMENT_API_KEY, 12_000);
if (!apiKey) throw new Error(`${CONTRACT}_RUNPOD_QUEUE_API_KEY_REQUIRED`);
const base = `https://api.runpod.ai/v2/${encodeURIComponent(lease.endpoint_id)}`;
const before = healthJobs(await nativeJsonRequest(`${base}/health`, apiKey));
if (before.in_queue !== 0 || before.in_progress !== 0) {
  throw new Error(`${CONTRACT}_ZERO_JOB_BASELINE_REQUIRED`);
}

const strictSystem = [
  avantiqoCodeMissionSystemReasoningSystemPrompt(),
  "TYPE CONTRACT: reasoning_scope, future_predictable_requirements, affected_domains, affected_capabilities, shared_primitives, data_lifecycle_implications, security_permissions, business_accounting_invariants, integration_implications, backward_compatibility, performance_implications, reporting_analytics_implications, automation_ai_hooks, expensive_to_change_decisions, invariants, completion_criteria, and verification_requirements MUST be JSON arrays of strings.",
  "TYPE CONTRACT: impact_graph MUST be a non-empty JSON object. architecture_recommendation MUST be a non-empty string. domain_ownership, api_contracts, and risks may be arrays or JSON objects.",
  "Return the final decision product directly. Do not wrap it in markdown and do not include private chain-of-thought.",
].join("\n");
const requestBody = {
  model: EXPECTED_MODEL,
  messages: [
    { role: "system", content: strictSystem },
    { role: "user", content: JSON.stringify(envelope) },
  ],
  temperature: 0.6,
  top_p: 0.95,
  response_format: { type: "json_object" },
  max_tokens: MAX_OUTPUT_TOKENS,
};

const startedAt = Date.now();
const completion = await nativeJsonRequest(
  `${base}/openai/v1/chat/completions`,
  apiKey,
  { method: "POST", body: requestBody, timeoutMs: RESPONSE_TIMEOUT_MS },
);
const generationLatencyMs = Date.now() - startedAt;
const responseModel = text(completion?.model, 300) || EXPECTED_MODEL;
if (responseModel !== EXPECTED_MODEL) {
  throw new Error(`${CONTRACT}_MODEL_MISMATCH:expected=${EXPECTED_MODEL}:actual=${responseModel}`);
}
const finalText = completionText(completion);
if (!finalText) {
  throw new Error(`${CONTRACT}_EMPTY_FINAL_COMPLETION:reasoning_transport_detected=${reasoningTransportDetected(completion)}:finish_reason=${text(completion?.choices?.[0]?.finish_reason, 120) || "NONE"}`);
}
const parsed = parseJsonObject(finalText);
if (!parsed) throw new Error(`${CONTRACT}_FINAL_DECISION_PRODUCT_NOT_JSON`);
const normalizedReasoning = normalizeDecisionProduct(parsed);
const finalized = finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
  mission: MISSION,
  learned_knowledge: learnedKnowledge,
  canonical_context: canonicalContext,
  repository_assessment: assessment,
  structured_reasoning: normalizedReasoning,
});
const reasoning = validateFinalized(finalized, repository);
const after = healthJobs(await nativeJsonRequest(`${base}/health`, apiKey));
if (after.in_queue > 1 || after.in_progress > 1) throw new Error(`${CONTRACT}_JOB_BOUND_EXCEEDED`);

const report = {
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  safe_lease_expires_at: lease.expires_at,
  repository: {
    ref: "main",
    head_sha: repository.head,
    expected_main_commit_pinned: true,
    tracked_worktree_clean: true,
    bounded_evidence_files: EVIDENCE.map(([filePath]) => filePath),
  },
  intelligence: {
    execution_lane: "deep",
    expected_model: EXPECTED_MODEL,
    response_model: responseModel,
    sampling_policy: "QWEN3_THINKING_2507_RECOMMENDED",
    generation_submitted: true,
    approved_generation_count: 1,
    models_warmup_request_performed: false,
    generation_latency_ms: generationLatencyMs,
    completion_tokens: finite(completion?.usage?.completion_tokens, 0),
    finish_reason: text(completion?.choices?.[0]?.finish_reason, 120) || null,
    reasoning_transport_detected: reasoningTransportDetected(completion),
    final_decision_product_sha256: sha256(finalText),
    raw_response_persisted: false,
    raw_reasoning_persisted: false,
  },
  result: {
    status: finalized.status,
    canonical_code_mission_contract: finalized.mission_context.contract,
    system_reasoning_contract: finalized.contract,
    mission_objective_preserved: finalized.mission_context.mission.objective === MISSION.objective,
    repository_head_preserved: finalized.mission_context.repository_context.head_sha === repository.head,
    architecture_recommendation_present: Boolean(text(reasoning.architecture_recommendation)),
    impact_graph_present: Object.keys(object(reasoning.impact_graph)).length > 0,
    invariants_count: reasoning.invariants.length,
    completion_criteria_count: reasoning.completion_criteria.length,
    verification_requirements_count: reasoning.verification_requirements.length,
  },
  governance: {
    general_intelligence_only: true,
    code_execution_started: false,
    source_mutation_performed: false,
    database_mutation_performed: false,
    wallet_mutation_performed: false,
    service_usage_accounting_performed: false,
    deployment_performed: false,
    knowledge_promotion_performed: false,
    raw_reasoning_persisted: false,
    direct_endpoint_scaling_performed_by_child: false,
    workers_max_mutation_performed_by_child: false,
    safe_lease_exclusively_owns_scaling: true,
    authorization_effect: "NONE",
  },
  health_after_generation: after,
  decision_product: finalized,
};
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_head: repository.head,
  status: finalized.status,
  canonical_code_mission_contract: finalized.mission_context.contract,
  system_reasoning_contract: finalized.contract,
  expected_model: EXPECTED_MODEL,
  response_model: responseModel,
  generation_submitted: true,
  approved_generation_count: 1,
  models_warmup_request_performed: false,
  generation_latency_ms: generationLatencyMs,
  completion_tokens: report.intelligence.completion_tokens,
  finish_reason: report.intelligence.finish_reason,
  reasoning_transport_detected: report.intelligence.reasoning_transport_detected,
  mission_objective_preserved: report.result.mission_objective_preserved,
  repository_head_preserved: report.result.repository_head_preserved,
  architecture_recommendation_present: report.result.architecture_recommendation_present,
  impact_graph_present: report.result.impact_graph_present,
  invariants_count: report.result.invariants_count,
  completion_criteria_count: report.result.completion_criteria_count,
  verification_requirements_count: report.result.verification_requirements_count,
  code_execution_started: false,
  database_mutation_performed: false,
  wallet_mutation_performed: false,
  service_usage_accounting_performed: false,
  deployment_performed: false,
  knowledge_promotion_performed: false,
  raw_reasoning_persisted: false,
  output_path: OUTPUT,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
