import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence";

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function localFallback({ task, input }) {
  return {
    provider: "local-fallback",
    model: "creative-search-fallback-v1",
    task,
    confidence: 55,
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
          ai_risk: "low"
        },
        {
          id: "fallback_idea_02",
          title: "Human-first opening",
          description: "Open with a believable human moment connected to the business goal instead of generic AI visuals.",
          assumptions: [],
          risks: ["Requires usable people or staff assets."],
          required_assets: [],
          production_cost: "medium",
          ai_risk: "medium"
        }
      ],
      evaluations: [],
      verification: {
        passed: true,
        issues: [],
        recommendations: []
      }
    }
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
`;

  const preferredProvider =
    process.env.AVANTIQO_REASONING_PROVIDER ||
    OWNED_INTELLIGENCE_PROVIDER;

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: preferredProvider,
    provider_policy: {
      selection_weights: {
        preference: 1,
      },
    },
    input: {
      prompt: `
${system}

TASK:

${JSON.stringify({
  task,
  input,
  constraints,
  outputShape,
})}
`,
      temperature,
    },
    metadata: {
      module: "CREATIVE",
      operation: "REASONING",
      intelligence_preference: "AVANTIQO_OWNED_FIRST",
    },
    category: "AI",
  });

  const content =
    execution?.output?.output?.text ||
    execution?.output?.text ||
    "";

  const parsed = parseJson(content);

  if (!parsed) {
    return localFallback({ task, input });
  }

  return {
    provider:
      execution?.provider ||
      execution?.output?.provider ||
      preferredProvider,
    model:
      execution?.model ||
      execution?.output?.model ||
      process.env.AVANTIQO_INTELLIGENCE_MODEL ||
      process.env.AVANTIQO_REASONING_MODEL ||
      null,
    task,
    confidence: parsed.confidence || 70,
    result: parsed.result || parsed,
  };
}
