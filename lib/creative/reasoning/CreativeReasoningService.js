import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

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

  let execution;

  try {
    execution = await ServiceExecutionRuntime.execute({
      organization_id: input.organization_id,
      service_id: "ai.reasoning.execute",
      provider_id: "openai",
      input: {
        model,
        response_format: {
          type: "json_object",
        },
        max_output_tokens: 16000,
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
      },
      category: "AI",
    });
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

  return {
    provider: "openai",
    model,
    task,
    confidence: Number(parsed.confidence || 70),
    fallback: false,
    recovery: false,
    recovery_source: null,
    fallback_reason: null,
    result: parsed.result || parsed,
  };
}
