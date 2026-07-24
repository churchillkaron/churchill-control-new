import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

import {
  compileCreativeStructuredOutputContract,
  decodeCreativeStructuredOutput,
  assertCreativeStructuredOutput,
} from "./CreativeStructuredOutputContract";

const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_TIMEOUT_MS = 240000;

function balancedJsonObject(value) {
  const text = String(value || "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  const text = String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    const candidate = balancedJsonObject(text);
    if (!candidate) return null;

    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : fallback;
}

function timeoutError(timeoutMs) {
  const error = new Error("CREATIVE_REASONING_TIMEOUT");
  error.code = "CREATIVE_REASONING_TIMEOUT";
  error.details = { timeout_ms: timeoutMs };
  return error;
}

async function withTimeout(promise, timeoutMs) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(timeoutError(timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function providerFailureReason(error = {}) {
  const message = String(
    error?.code ||
    error?.message ||
    "CREATIVE_REASONING_PROVIDER_FAILED",
  );
  const provider = error?.provider_response || {};
  const detail = {
    code: message,
    status: provider.status || null,
    incomplete_details: provider.incomplete_details || null,
    output_length:
      Number.isFinite(Number(provider.output_length))
        ? Number(provider.output_length)
        : null,
    timeout_ms:
      Number.isFinite(Number(error?.details?.timeout_ms))
        ? Number(error.details.timeout_ms)
        : null,
  };

  return `CREATIVE_REASONING_PROVIDER_FAILURE:${JSON.stringify(detail)}`;
}

function missionDirectedRecovery({ task, input, reason = null }) {
  return {
    provider: "mission-contract-recovery",
    model: "creative-mission-storybeat-recovery-v1",
    task,
    confidence: 0,
    fallback: true,
    recovery: true,
    recovery_source: "ACCEPTED_MISSION_CONTRACT",
    fallback_reason: reason || "CREATIVE_REASONING_OUTPUT_INVALID",
    result: {
      ideas: [],
      evaluations: [],
      recovery: {
        source: "ACCEPTED_MISSION_CONTRACT",
        objective: input.objective || input.brief?.objective || "",
        required_story_beats:
          input.brief?.required_story_beats ||
          input.brief?.scene_plan ||
          input.brief?.specifications?.structure ||
          [],
        available_asset_count:
          Array.isArray(input.assets)
            ? input.assets.length
            : 0,
      },
      verification: {
        passed: false,
        issues: [reason || "CREATIVE_REASONING_OUTPUT_INVALID"],
        recommendations: [
          "Continue from the accepted mission story beats and canonical production contracts without an automatic provider retry.",
        ],
      },
    },
  };
}

function structuredOutput(execution = {}) {
  return (
    execution?.structured_output ||
    execution?.output?.output?.json ||
    execution?.output?.json ||
    execution?.output?.result?.json ||
    execution?.result?.output?.json ||
    null
  );
}

function outputText(execution = {}) {
  return (
    execution?.output?.output?.text ||
    execution?.output?.text ||
    execution?.output?.content ||
    execution?.output?.result?.text ||
    execution?.result?.output?.text ||
    ""
  );
}

export async function reason({
  task,
  input = {},
  constraints = {},
  outputShape = {},
  temperature = 0.7,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  metadata = {},
}) {
  const system = `
You are a reasoning worker inside Avantiqo Creative Intelligence.

Critical rules:
- You do not own the final campaign.
- You do not write final generator prompts.
- You do not use fixed campaign templates.
- You do not decide alone.
- You solve only the assigned reasoning task.
- Return strict JSON only.
- No markdown.
- No paragraphs unless inside JSON fields.
- Prefer structured options, scores, risks, assumptions, missing data, and tradeoffs.
- Avantiqo runtime makes the final decision.
  `.trim();

  const model =
    process.env.AVANTIQO_REASONING_MODEL ||
    "gpt-4.1-mini";
  const tokenBudget = positiveInteger(
    maxOutputTokens,
    DEFAULT_MAX_OUTPUT_TOKENS,
  );
  const executionTimeout = positiveInteger(
    timeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  const structuredContract =
    compileCreativeStructuredOutputContract({
      outputShape,
      name:
        metadata.structured_output_name ||
        metadata.creative_director_step_key ||
        metadata.operation ||
        "creative_reasoning",
      description:
        metadata.structured_output_description ||
        `Strict structured output for ${String(task || "creative reasoning").slice(0, 180)}`,
    });

  let execution;

  try {
    execution = await withTimeout(
      ServiceExecutionRuntime.execute({
        organization_id: input.organization_id,
        preserve_structured_output: true,
        service_id: "ai.reasoning.execute",
        provider_id: "openai",
        input: {
          model,
          response_format:
            structuredContract.response_format,
          max_output_tokens: tokenBudget,
          temperature,
          prompt: `
${system}

TASK:
${JSON.stringify({
  task,
  input,
  constraints,
  outputShape,
})}
          `.trim(),
        },
        metadata: {
          module: "CREATIVE",
          operation: "REASONING",
          reasoning_timeout_ms: executionTimeout,
          reasoning_max_output_tokens: tokenBudget,
          structured_output_contract_version:
            structuredContract.version,
          structured_output_contract_name:
            structuredContract.name,
          structured_output_strict: true,
          ...metadata,
        },
        category: "AI",
      }),
      executionTimeout,
    );
  } catch (error) {
    return missionDirectedRecovery({
      task,
      input,
      reason: providerFailureReason(error),
    });
  }

  const parsed =
    parseJson(structuredOutput(execution)) ||
    parseJson(outputText(execution));

  if (!parsed) {
    const providerStatus =
      execution?.output?.output?.response_status ||
      execution?.output?.response_status ||
      null;
    const incompleteDetails =
      execution?.output?.output?.incomplete_details ||
      execution?.output?.incomplete_details ||
      null;
    const reasonCode = incompleteDetails
      ? `CREATIVE_REASONING_INCOMPLETE:${JSON.stringify(incompleteDetails)}`
      : providerStatus
        ? `CREATIVE_REASONING_INVALID_JSON:${providerStatus}`
        : "CREATIVE_REASONING_OUTPUT_MISSING";

    return missionDirectedRecovery({
      task,
      input,
      reason: reasonCode,
    });
  }

  let decoded;
  let validation;

  try {
    decoded = decodeCreativeStructuredOutput(parsed);
    validation = assertCreativeStructuredOutput({
      value: decoded,
      outputShape,
    });
  } catch (error) {
    return missionDirectedRecovery({
      task,
      input,
      reason: `CREATIVE_REASONING_SCHEMA_REJECTED:${JSON.stringify({
        code: error.code || error.message,
        details: error.details || null,
        contract_version: structuredContract.version,
        contract_name: structuredContract.name,
      })}`,
    });
  }

  return {
    provider: "openai",
    model,
    task,
    confidence: Number(decoded.confidence || 70),
    fallback: false,
    recovery: false,
    recovery_source: null,
    fallback_reason: null,
    token_budget: tokenBudget,
    timeout_ms: executionTimeout,
    structured_output_contract: {
      version: structuredContract.version,
      name: structuredContract.name,
      strict: true,
      validation,
    },
    result: decoded.result || decoded,
  };
}
