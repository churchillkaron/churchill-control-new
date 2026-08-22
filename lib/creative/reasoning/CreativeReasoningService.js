import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function localFallback({ task, input }) {
  return {
    task,
    confidence: 55,
    execution_source: "deterministic_local_fallback",
    raw_reasoning_persisted: false,
    provider_selection_exposed: false,
    result: {
      ideas: [
        {
          id: "fallback_idea_01",
          title: "Use real assets first",
          description: "Build the production from authentic business photos, videos, brand assets, and only generate missing scenes.",
          assumptions: [],
          risks: ["May need more asset quality analysis."],
          required_assets: [],
          production_cost: "low",
          ai_risk: "low",
        },
        {
          id: "fallback_idea_02",
          title: "Human-first opening",
          description: "Open with a believable human moment connected to the business goal instead of generic AI visuals.",
          assumptions: [],
          risks: ["Requires usable people or staff assets."],
          required_assets: [],
          production_cost: "medium",
          ai_risk: "medium",
        },
      ],
      evaluations: [],
      verification: {
        passed: true,
        issues: [],
        recommendations: [],
      },
    },
  };
}

export async function reason({
  task,
  input = {},
  constraints = {},
  outputShape = {},
  temperature = 0.7,
}) {
  const system = `
You are a bounded reasoning worker inside Avantiqo Intelligence.

Critical rules:
- Avantiqo Intelligence and the Creative Partner own the mission and final decision.
- You do not choose or name infrastructure vendors or AI providers.
- Choose only business/creative outcomes and canonical Avantiqo capabilities supplied in context.
- You do not write persistent generator prompts; structured specifications are source of truth.
- You do not use fixed campaign templates.
- You solve only the assigned reasoning task.
- Never return chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.
- Return strict JSON only.
- No markdown.
- Prefer structured decisions, options, scores, risks, assumptions, missing data, capabilities, and tradeoffs.
`;

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify({
        task,
        input,
        constraints,
        outputShape,
      }),
      instructions_text: system,
      temperature,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "REASONING",
      capability_only_orchestration: true,
      owned_first_resolution: true,
      raw_reasoning_persisted: false,
      provider_selection_exposed: false,
    },
    category: "AI",
  });

  const content =
    execution?.output?.output?.text ||
    execution?.output?.text ||
    execution?.output?.result ||
    "";

  const parsed = parseJson(content);

  if (!parsed) {
    return localFallback({ task, input });
  }

  return {
    task,
    confidence: Number(parsed.confidence || 70),
    execution_source: "governed_service_runtime",
    raw_reasoning_persisted: false,
    provider_selection_exposed: false,
    result: parsed.result || parsed,
  };
}
