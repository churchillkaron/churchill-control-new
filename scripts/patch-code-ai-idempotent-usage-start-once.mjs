import { readFile, writeFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_IDEMPOTENT_USAGE_START_PATCH_V1";
const PLANNER_PATH = "lib/code/runtime/CodeAIPlannerExecutionRuntime.js";
const USAGE_RUNTIME_PATH = "lib/platform/service-runtime/usage/UsageRuntime.js";
const USAGE_REPOSITORY_PATH = "lib/platform/service-runtime/usage/repositories/ServiceUsageRepository.js";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return { source, changed: false, already: true };
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_BASE_NOT_FOUND`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${CONTRACT}_${label}_BASE_AMBIGUOUS`);
  }
  return {
    source: source.slice(0, first) + after + source.slice(first + before.length),
    changed: true,
    already: false,
  };
}

let planner = await readFile(PLANNER_PATH, "utf8");
let usageRuntime = await readFile(USAGE_RUNTIME_PATH, "utf8");
let usageRepository = await readFile(USAGE_REPOSITORY_PATH, "utf8");

({ source: planner } = replaceOnce(
  planner,
  'import {\n  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,',
  'import { createHash } from "node:crypto";\n\nimport {\n  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,',
  "PLANNER_CRYPTO_IMPORT",
));

({ source: planner } = replaceOnce(
  planner,
  'const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";',
  'const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";\nconst CODE_AI_USAGE_ID_CONTRACT = "AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1";',
  "PLANNER_USAGE_ID_CONTRACT",
));

const plannerDelayBefore = `function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runpodSafeReadResponse`;
const plannerDelayAfter = `function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicPlannerUsageId(executionInput = {}, recoveryCount = 0) {
  const metadata = object(executionInput.metadata);
  const missionId = text(metadata.code_ai_mission_id);
  const iteration = Math.trunc(number(metadata.code_ai_iteration, 0));
  if (!missionId || iteration <= 0) return null;

  const digest = createHash("sha256")
    .update(
      CODE_AI_USAGE_ID_CONTRACT + ":" + missionId + ":" + iteration + ":recovery:" +
      Math.max(0, Math.trunc(number(recoveryCount, 0))),
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

async function runpodSafeReadResponse`;
({ source: planner } = replaceOnce(
  planner,
  plannerDelayBefore,
  plannerDelayAfter,
  "PLANNER_USAGE_ID_HELPER",
));

const normalizedBefore = `function normalizedExecutionInput(value) {
  const raw = object(value);
  const input = object(raw.input);
  const instructions = text(input.instructions || input.instruction);
  const preview = localDevelopmentOwnedReviewPolicy(raw);
  return {
    ...raw,
    ...preview,
    input: {
      ...input,
      ...(instructions ? { instructions } : {}),
    },
  };
}`;
const normalizedAfter = `function normalizedExecutionInput(value) {
  const raw = object(value);
  const input = object(raw.input);
  const instructions = text(input.instructions || input.instruction);
  const preview = localDevelopmentOwnedReviewPolicy(raw);
  const normalized = {
    ...raw,
    ...preview,
    input: {
      ...input,
      ...(instructions ? { instructions } : {}),
    },
  };
  const usageId = deterministicPlannerUsageId(normalized, 0);
  return usageId
    ? {
        ...normalized,
        metadata: {
          ...object(normalized.metadata),
          code_ai_usage_id_contract: CODE_AI_USAGE_ID_CONTRACT,
          code_ai_usage_id: usageId,
        },
      }
    : normalized;
}`;
({ source: planner } = replaceOnce(
  planner,
  normalizedBefore,
  normalizedAfter,
  "PLANNER_NORMALIZED_USAGE_ID",
));

const recoveryBefore = `  const replacement = await serviceRuntime.execute(replacementInput);`;
const recoveryAfter = `  const replacementUsageId = deterministicPlannerUsageId(
    replacementInput,
    recoveryCount + 1,
  );
  if (replacementUsageId) {
    replacementInput = {
      ...replacementInput,
      metadata: {
        ...object(replacementInput.metadata),
        code_ai_usage_id_contract: CODE_AI_USAGE_ID_CONTRACT,
        code_ai_usage_id: replacementUsageId,
      },
    };
  }

  const replacement = await serviceRuntime.execute(replacementInput);`;
({ source: planner } = replaceOnce(
  planner,
  recoveryBefore,
  recoveryAfter,
  "PLANNER_STALE_REPLACEMENT_USAGE_ID",
));

({ source: usageRuntime } = replaceOnce(
  usageRuntime,
  'import * as Repository\nfrom "./repositories/ServiceUsageRepository";\n',
  'import * as Repository\nfrom "./repositories/ServiceUsageRepository";\n\nimport {\n  createIdempotentUsageRecord,\n} from "./IdempotentUsageStart.js";\n',
  "USAGE_RUNTIME_IDEMPOTENT_IMPORT",
));

const selectedModelBefore = `function selectedModel(metadata = {}) {
  return text(metadata?.model) || null;
}`;
const selectedModelAfter = `function selectedModel(metadata = {}) {
  return text(metadata?.model) || null;
}

function codeAIIdempotentUsageId(input = {}, metadata = {}) {
  const usageId = text(metadata?.code_ai_usage_id);
  if (!usageId) return null;
  if (text(metadata?.code_ai_usage_id_contract) !== "AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1") {
    return null;
  }
  if (text(input.provider) !== "avantiqo-code") return null;
  if (text(input.capability) !== "ai.code.debug") return null;
  if (metadata?.owned_orchestration !== true) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(usageId)
    ? usageId
    : null;
}`;
({ source: usageRuntime } = replaceOnce(
  usageRuntime,
  selectedModelBefore,
  selectedModelAfter,
  "USAGE_RUNTIME_CODE_ID",
));

const usageStartBefore = `  async start(input = {}) {
    const metadata = sanitizeMetadata(input.metadata);
    return Repository.create(
      createServiceUsageRecord({
        ...input,
        module:
          input.module ||
          object(metadata).module ||
          null,
        provider_model:
          input.provider_model ||
          selectedModel(metadata),
        metadata,
        status: "PENDING",
        invoice_status:
          "UNBILLED",
      })
    );
  },`;
const usageStartAfter = `  async start(input = {}) {
    const metadata = sanitizeMetadata(input.metadata);
    const idempotentUsageId = codeAIIdempotentUsageId(input, metadata);
    const record = createServiceUsageRecord({
      ...input,
      ...(idempotentUsageId ? { id: idempotentUsageId } : {}),
      module:
        input.module ||
        object(metadata).module ||
        null,
      provider_model:
        input.provider_model ||
        selectedModel(metadata),
      metadata,
      status: "PENDING",
      invoice_status:
        "UNBILLED",
    });

    if (!idempotentUsageId) {
      return Repository.create(record);
    }

    return createIdempotentUsageRecord({
      record,
      create: Repository.create,
      find: Repository.findById,
    });
  },`;
({ source: usageRuntime } = replaceOnce(
  usageRuntime,
  usageStartBefore,
  usageStartAfter,
  "USAGE_RUNTIME_START",
));

const repoBefore = `export async function getById(id) {
  if (!id) {
    throw new Error(
      "usage id required"
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error) {
    throw error;
  }

  return data;
}
`;
const repoAfter = `${repoBefore}
export async function findById(id) {
  if (!id) {
    throw new Error("usage id required");
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
`;
({ source: usageRepository } = replaceOnce(
  usageRepository,
  repoBefore,
  repoAfter,
  "USAGE_REPOSITORY_FIND_BY_ID",
));

await writeFile(PLANNER_PATH, planner, "utf8");
await writeFile(USAGE_RUNTIME_PATH, usageRuntime, "utf8");
await writeFile(USAGE_REPOSITORY_PATH, usageRepository, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  changed_files: [PLANNER_PATH, USAGE_RUNTIME_PATH, USAGE_REPOSITORY_PATH],
  deterministic_code_usage_id: true,
  lost_usage_insert_response_recoverable: true,
  stale_replacement_uses_distinct_usage_id: true,
  provider_post_retry_added: false,
  wallet_duplicate_reservation_enabled: false,
  provider_spend_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
