import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT,
  avantiqoCodeMissionSystemReasoningSystemPrompt,
  buildAvantiqoCodeMissionSystemReasoningEnvelope,
  finalizeAvantiqoIntelligenceCodeMissionSystemReasoning,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js";

const CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_RUNTIME_PROOF_V1";
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
    "/tmp/avantiqo-intelligence-code-mission-system-reasoning-runtime-proof.json",
);

const MISSION = Object.freeze({
  id: "general-intelligence-system-reasoning-runtime-proof-v1",
  objective: [
    "Evaluate how Avantiqo should carry significant cross-system architecture and impact context from General Intelligence into Code Intelligence",
    "while preserving verified Self-Learning boundaries, current-repository authority, batched Code work packages, deterministic verification, and one governed implementation plan.",
    "Reuse the existing shared contracts when current-main evidence supports them; do not create a second planner, memory system, impact engine, or coding agent.",
  ].join(" "),
  business_intent:
    "Prove that owned General Intelligence can produce a complete, future-proof architecture decision product that is safe to hand to Code Intelligence without performing implementation.",
});

const EVIDENCE_FILES = Object.freeze([
  {
    file_path: "lib/intelligence/runtime/AvantiqoProductConstitution.js",
    expected_token: "AVANTIQO_PRODUCT_CONSTITUTION_V1",
    observation:
      "Current main contains the canonical Avantiqo Product Constitution used as shared architecture authority.",
  },
  {
    file_path: "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionRuntime.js",
    expected_token: "AVANTIQO_INTELLIGENCE_CODE_MISSION_V1",
    observation:
      "Current main contains the canonical Intelligence-to-Code mission contract with Learning, General, Code, and deterministic-controller governance boundaries.",
  },
  {
    file_path:
      "lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js",
    expected_token: "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1",
    observation:
      "Current main contains the General system-reasoning adapter that finalizes through the canonical Code mission contract.",
  },
  {
    file_path: "lib/intelligence/runtime/AvantiqoCodeMissionLearningIngressRuntime.js",
    expected_token: "AVANTIQO_CODE_MISSION_LEARNING_INGRESS_V1",
    observation:
      "Current main contains guarded Code-to-Learning evidence ingress rather than direct reusable-knowledge promotion.",
  },
  {
    file_path: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
    expected_token: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    observation:
      "Current main contains the governed Code work-package contract used for batched implementation and controller-owned verification/diff behavior.",
  },
]);

function text(value, limit = 12_000) {
  return String(value ?? "").trim().slice(0, limit);
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
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
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
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !==
    SAFE_LEASE_CONTRACT
  ) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !==
    SAFE_LEASE_LANE
  ) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_LANE_MISMATCH`);
  }
  const leasedEndpointId = text(
    process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID,
    240,
  );
  const configuredEndpointId = text(
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID,
    240,
  );
  if (
    !leasedEndpointId ||
    !configuredEndpointId ||
    leasedEndpointId !== configuredEndpointId
  ) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_MISMATCH`);
  }
  const expiresAt = Date.parse(
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160),
  );
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 480_000) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_EXPIRY_INSUFFICIENT`);
  }
  return {
    endpoint_id: leasedEndpointId,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

function validateCurrentMain() {
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    `${CONTRACT}_GIT_HEAD_FAILED`,
  ).toLowerCase();
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    `${CONTRACT}_GIT_REMOTE_MAIN_FAILED`,
  ).toLowerCase();
  if (head !== remote) {
    throw new Error(`${CONTRACT}_EXACT_ORIGIN_MAIN_REQUIRED:head=${head}:origin=${remote}`);
  }
  const trackedChanges = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    `${CONTRACT}_GIT_STATUS_FAILED`,
  );
  if (trackedChanges) {
    throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  }
  const trackedFiles = shell(
    "git",
    ["ls-files"],
    `${CONTRACT}_GIT_LS_FILES_FAILED`,
  )
    .split("\n")
    .filter(Boolean);
  return {
    head,
    tracked_file_count: trackedFiles.length,
  };
}

async function buildRepositoryAssessment(repositoryState) {
  const evidenceFiles = [];
  const observations = [];
  for (const definition of EVIDENCE_FILES) {
    const content = await readFile(resolve(definition.file_path), "utf8");
    if (!content.includes(definition.expected_token)) {
      throw new Error(
        `${CONTRACT}_REPOSITORY_EVIDENCE_TOKEN_MISSING:${definition.file_path}:${definition.expected_token}`,
      );
    }
    const lines = content.split("\n");
    evidenceFiles.push({
      file_path: definition.file_path,
      found: true,
      start_line: 1,
      end_line: Math.min(lines.length, 180),
      total_lines: lines.length,
      discovery_queries: [definition.expected_token],
      discovery_sources: ["CONTROLLED_CURRENT_MAIN_PROOF_EVIDENCE"],
      content: lines.slice(0, 180).join("\n"),
    });
    observations.push(definition.observation);
  }

  return {
    contract: "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
    status: "CONTROLLED_CURRENT_MAIN_PROOF_EVIDENCE_READY",
    repository_snapshot: {
      repository_url: REPOSITORY_URL,
      ref: "main",
      current_main_head: repositoryState.head,
      generated_at: new Date().toISOString(),
      clean_checkout: true,
      tracked_file_count: repositoryState.tracked_file_count,
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
        "Controlled proof evidence confirms that the shared Intelligence-to-Code mission, General system-reasoning adapter, Code work-package runtime, Product Constitution, and guarded Code-to-Learning ingress exist on the exact current origin/main commit.",
      repository_observations: observations,
      gaps: [
        "This controlled runtime proof uses a bounded deterministic evidence set and is not a full repository certification.",
        "Code Intelligence must independently refetch and inspect newest main before any mutation.",
      ],
      engineering_objective:
        "Evidence-only repository objective: inspect the current shared Intelligence/Code contracts. This must not replace the proof mission objective.",
      completion_criteria: [
        "The General decision product preserves the actual proof mission rather than the evidence assessment's separate objective.",
      ],
    },
    objective_selection: {
      selected_objective:
        "Evidence-only repository objective: inspect the current shared Intelligence/Code contracts. This must not replace the proof mission objective.",
      selected_evidence_paths: EVIDENCE_FILES.map((item) => item.file_path),
      selected_completion_criteria: [
        "Bounded current-main evidence is supplied without granting implementation authority.",
      ],
    },
    evidence_limits: [
      "Only the listed current-main files are supplied as proof evidence.",
      "Absence from the bounded evidence set does not prove repository-wide absence.",
      "No build, E2E suite, database inspection, deployment, or source mutation is performed by this proof.",
    ],
  };
}

function nativeJsonRequest(
  url,
  apiKey,
  { method = "GET", body = null, timeoutMs = HEALTH_TIMEOUT_MS } = {},
) {
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

    const request = https.request(
      target,
      {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (response) => {
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
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          const status = Number(response.statusCode || 0);
          if (status < 200 || status >= 300) {
            finish(
              rejectPromise,
              new Error(
                `${CONTRACT}_HTTP_${status}:${redact(
                  parsed?.error?.message || parsed?.message || raw,
                )}`,
              ),
            );
            return;
          }
          if (!parsed || typeof parsed !== "object") {
            finish(
              rejectPromise,
              new Error(`${CONTRACT}_INVALID_JSON_RESPONSE`),
            );
            return;
          }
          finish(resolvePromise, parsed);
        });
      },
    );

    request.on("error", (error) => {
      finish(
        rejectPromise,
        new Error(`${CONTRACT}_NATIVE_HTTPS_FAILED:${redact(error?.message)}`),
      );
    });
    timer = setTimeout(() => {
      request.destroy(
        new Error(`${CONTRACT}_NATIVE_HTTPS_DEADLINE_EXCEEDED:${timeoutMs}`),
      );
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
    return content
      .map((part) =>
        typeof part === "string" ? part : text(part?.text, 20_000),
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function parseDecisionProduct(value) {
  const source = text(value, 200_000).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try next bounded candidate.
    }
  }
  return null;
}

function reasoningTransportDetected(body = {}) {
  const message = body?.choices?.[0]?.message || {};
  return Boolean(text(message.reasoning_content || message.reasoning, 1));
}

function validateFinalized(result, repositoryState) {
  if (
    result?.contract !==
    AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_CONTRACT
  ) {
    throw new Error(`${CONTRACT}_FINAL_CONTRACT_INVALID`);
  }
  if (result?.status !== "READY_FOR_CODE") {
    throw new Error(`${CONTRACT}_READY_FOR_CODE_REQUIRED`);
  }
  if (result?.mission_context?.mission?.id !== MISSION.id) {
    throw new Error(`${CONTRACT}_MISSION_ID_NOT_PRESERVED`);
  }
  if (result?.mission_context?.mission?.objective !== MISSION.objective) {
    throw new Error(`${CONTRACT}_MISSION_OBJECTIVE_NOT_PRESERVED`);
  }
  if (
    result?.mission_context?.repository_context?.head_sha !==
    repositoryState.head
  ) {
    throw new Error(`${CONTRACT}_REPOSITORY_HEAD_NOT_PRESERVED`);
  }
  const reasoning = result?.mission_context?.system_reasoning || {};
  if (!text(reasoning.architecture_recommendation, 10_000)) {
    throw new Error(`${CONTRACT}_ARCHITECTURE_RECOMMENDATION_REQUIRED`);
  }
  if (!reasoning.impact_graph || !Object.keys(reasoning.impact_graph).length) {
    throw new Error(`${CONTRACT}_IMPACT_GRAPH_REQUIRED`);
  }
  for (const [key, value] of [
    ["invariants", reasoning.invariants],
    ["completion_criteria", reasoning.completion_criteria],
    ["verification_requirements", reasoning.verification_requirements],
  ]) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${CONTRACT}_${key.toUpperCase()}_REQUIRED`);
    }
  }
  if (
    result?.governance?.repository_assessment_selected_objective_replaced_mission !==
    false
  ) {
    throw new Error(`${CONTRACT}_REPOSITORY_OBJECTIVE_REPLACED_MISSION`);
  }
  if (
    result?.governance?.code_execution_started !== false ||
    result?.governance?.source_mutation_performed !== false ||
    result?.governance?.database_mutation_performed !== false ||
    result?.governance?.deployment_performed !== false ||
    result?.governance?.knowledge_promotion_performed !== false ||
    result?.governance?.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_MUTATION_GOVERNANCE_INVALID`);
  }
  return reasoning;
}

console.log(`${CONTRACT}_MODE=CONTROLLED_DEEP_MODEL_CONTRACT_BOUNDARY`);
console.log(`${CONTRACT}_SERVICE_EXECUTION_RUNTIME_BYPASSED=true`);
console.log(`${CONTRACT}_DATABASE_MUTATION=false`);
console.log(`${CONTRACT}_WALLET_MUTATION=false`);
console.log(`${CONTRACT}_LEARNING_PROMOTION=false`);
console.log(`${CONTRACT}_CODE_EXECUTION=false`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY=false`);

const lease = requireApprovalAndLease();
const repositoryState = validateCurrentMain();
const repositoryAssessment = await buildRepositoryAssessment(repositoryState);
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
  proof_scope: "GENERAL_INTELLIGENCE_SYSTEM_REASONING_MODEL_CONTRACT_BOUNDARY",
  future_proof_architecture_not_feature_count: true,
  code_implementation_authorized: false,
};
const envelope = buildAvantiqoCodeMissionSystemReasoningEnvelope({
  mission: MISSION,
  learned_knowledge: learnedKnowledge,
  canonical_context: canonicalContext,
  repository_assessment: repositoryAssessment,
});

const apiKey =
  text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12_000) ||
  text(process.env.RUNPOD_API_KEY, 12_000) ||
  text(process.env.RUNPOD_MANAGEMENT_API_KEY, 12_000);
if (!apiKey) throw new Error(`${CONTRACT}_RUNPOD_QUEUE_API_KEY_REQUIRED`);
const base = `https://api.runpod.ai/v2/${encodeURIComponent(lease.endpoint_id)}`;

const beforeHealth = await nativeJsonRequest(`${base}/health`, apiKey, {
  timeoutMs: HEALTH_TIMEOUT_MS,
});
const beforeJobs = healthJobs(beforeHealth);
if (beforeJobs.in_queue !== 0 || beforeJobs.in_progress !== 0) {
  throw new Error(
    `${CONTRACT}_ZERO_JOB_BASELINE_REQUIRED:in_queue=${beforeJobs.in_queue}:in_progress=${beforeJobs.in_progress}`,
  );
}

const models = await nativeJsonRequest(`${base}/openai/v1/models`, apiKey, {
  timeoutMs: RESPONSE_TIMEOUT_MS,
});
const modelIds = Array.isArray(models?.data)
  ? models.data.map((entry) => text(entry?.id, 300)).filter(Boolean)
  : [];
if (!modelIds.includes(EXPECTED_MODEL)) {
  throw new Error(
    `${CONTRACT}_EXPECTED_MODEL_NOT_SERVED:${modelIds.join(",") || "NONE"}`,
  );
}

const requestBody = {
  model: EXPECTED_MODEL,
  messages: [
    {
      role: "system",
      content: avantiqoCodeMissionSystemReasoningSystemPrompt(),
    },
    {
      role: "user",
      content: JSON.stringify(envelope),
    },
  ],
  temperature: 0.6,
  top_p: 0.95,
  response_format: { type: "json_object" },
  max_tokens: MAX_OUTPUT_TOKENS,
};

const generationStartedAt = Date.now();
const completion = await nativeJsonRequest(
  `${base}/openai/v1/chat/completions`,
  apiKey,
  {
    method: "POST",
    body: requestBody,
    timeoutMs: RESPONSE_TIMEOUT_MS,
  },
);
const generationLatencyMs = Date.now() - generationStartedAt;
const responseModel = text(completion?.model, 300) || EXPECTED_MODEL;
if (responseModel !== EXPECTED_MODEL) {
  throw new Error(
    `${CONTRACT}_MODEL_MISMATCH:expected=${EXPECTED_MODEL}:actual=${responseModel}`,
  );
}
const finalText = completionText(completion);
if (!finalText) {
  throw new Error(
    `${CONTRACT}_EMPTY_FINAL_COMPLETION:reasoning_transport_detected=${reasoningTransportDetected(
      completion,
    )}:finish_reason=${text(completion?.choices?.[0]?.finish_reason, 120) || "NONE"}`,
  );
}
const structuredReasoning = parseDecisionProduct(finalText);
if (!structuredReasoning) {
  throw new Error(`${CONTRACT}_FINAL_DECISION_PRODUCT_NOT_JSON`);
}

const finalized = finalizeAvantiqoIntelligenceCodeMissionSystemReasoning({
  mission: MISSION,
  learned_knowledge: learnedKnowledge,
  canonical_context: canonicalContext,
  repository_assessment: repositoryAssessment,
  structured_reasoning: structuredReasoning,
});
const reasoning = validateFinalized(finalized, repositoryState);

const afterHealth = await nativeJsonRequest(`${base}/health`, apiKey, {
  timeoutMs: HEALTH_TIMEOUT_MS,
});
const afterJobs = healthJobs(afterHealth);
if (afterJobs.in_queue > 1 || afterJobs.in_progress > 1) {
  throw new Error(
    `${CONTRACT}_JOB_BOUND_EXCEEDED:in_queue=${afterJobs.in_queue}:in_progress=${afterJobs.in_progress}`,
  );
}

const report = {
  success: true,
  contract: CONTRACT,
  proof_scope: "DEEP_MODEL_AND_CANONICAL_MISSION_CONTRACT_BOUNDARY_ONLY",
  production_service_execution_path_certified: false,
  production_service_execution_path_reason:
    "ServiceExecutionRuntime is intentionally bypassed in this proof so database/wallet usage accounting is not mutated. A later production-path proof must report accounting side effects honestly.",
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  safe_lease_endpoint_id_matches_configuration: true,
  safe_lease_expires_at: lease.expires_at,
  repository: {
    ref: "main",
    head_sha: repositoryState.head,
    exact_origin_main_match: true,
    tracked_worktree_clean: true,
    bounded_evidence_files: EVIDENCE_FILES.map((item) => item.file_path),
  },
  mission: {
    id: MISSION.id,
    objective_preserved: finalized.mission_context.mission.objective === MISSION.objective,
    repository_assessment_objective_replaced_mission: false,
  },
  intelligence: {
    provider: "avantiqo-intelligence-owned-runpod-endpoint",
    execution_lane: "deep",
    expected_model: EXPECTED_MODEL,
    response_model: responseModel,
    sampling_policy: "QWEN3_THINKING_2507_RECOMMENDED",
    temperature: 0.6,
    top_p: 0.95,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    generation_submitted: true,
    approved_generation_count: 1,
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
    repository_head_preserved:
      finalized.mission_context.repository_context.head_sha === repositoryState.head,
    architecture_recommendation_present: Boolean(
      text(reasoning.architecture_recommendation, 10_000),
    ),
    impact_graph_present: Object.keys(reasoning.impact_graph || {}).length > 0,
    invariants_count: Array.isArray(reasoning.invariants)
      ? reasoning.invariants.length
      : 0,
    completion_criteria_count: Array.isArray(reasoning.completion_criteria)
      ? reasoning.completion_criteria.length
      : 0,
    verification_requirements_count: Array.isArray(reasoning.verification_requirements)
      ? reasoning.verification_requirements.length
      : 0,
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
  health_after_generation: afterJobs,
  decision_product: finalized,
};

await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      proof_scope: report.proof_scope,
      repository_head: repositoryState.head,
      mission_id: MISSION.id,
      status: finalized.status,
      canonical_code_mission_contract: finalized.mission_context.contract,
      system_reasoning_contract: finalized.contract,
      expected_model: EXPECTED_MODEL,
      response_model: responseModel,
      generation_submitted: true,
      approved_generation_count: 1,
      generation_latency_ms: generationLatencyMs,
      completion_tokens: report.intelligence.completion_tokens,
      finish_reason: report.intelligence.finish_reason,
      reasoning_transport_detected:
        report.intelligence.reasoning_transport_detected,
      architecture_recommendation_present:
        report.result.architecture_recommendation_present,
      impact_graph_present: report.result.impact_graph_present,
      invariants_count: report.result.invariants_count,
      completion_criteria_count: report.result.completion_criteria_count,
      verification_requirements_count:
        report.result.verification_requirements_count,
      database_mutation_performed: false,
      wallet_mutation_performed: false,
      service_usage_accounting_performed: false,
      source_mutation_performed: false,
      code_execution_started: false,
      deployment_performed: false,
      knowledge_promotion_performed: false,
      raw_reasoning_persisted: false,
      production_service_execution_path_certified: false,
      output_path: OUTPUT,
      secrets_printed: false,
    },
    null,
    2,
  ),
);
console.log(`${CONTRACT}=PASS`);
