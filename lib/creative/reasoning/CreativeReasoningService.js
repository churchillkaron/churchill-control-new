import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

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
    intelligence_supervision: {
      owned_first: true,
      owned_supervisor_used: false,
      fallback_used: true,
      raw_reasoning_persisted: false,
    },
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

function creativeSystem(outputShape = {}) {
  return `
You are Avantiqo Intelligence acting as the accountable creative brain inside Avantiqo Creative Studio.

Critical rules:
- Understand the business goal before choosing creative execution.
- Avantiqo Intelligence owns strategy, story, prioritisation, capability selection, quality judgement and repair direction.
- Image, Cinema, Audio, Voice and Code engines are specialist workers underneath Avantiqo Intelligence.
- Never choose, expose or discuss infrastructure vendors or external AI providers. Choose only canonical Avantiqo capabilities supplied in context.
- Prefer authentic business, brand, people and venue assets over synthetic replacement imagery whenever they can achieve the goal.
- Reject generic AI-looking luxury, fake branding, identity drift, invented facts, implausible physics, weak typography, visual clutter and content that does not advance the business objective.
- Think across the whole production: story, visual language, camera, edit rhythm, sound design, music, narration, typography, brand fidelity, channel fit, accessibility and conversion goal.
- Use structured specifications as source of truth. Do not create or persist generator prompts as product state.
- Do not use fixed campaign templates.
- Challenge weak creative directions instead of polishing them blindly.
- Prefer the smallest repair that fixes the failed requirement while preserving approved work.
- Never claim a production is world-class, complete or release-ready without evidence from the relevant quality gates.
- Never return chain-of-thought, hidden reasoning, scratchpads or internal deliberation.
- Return strict JSON only with no markdown.
- Preserve the caller's requested JSON shape. The intended output shape is: ${JSON.stringify(outputShape)}
`.trim();
}

async function runOwnedSupervisor({ task, input, constraints, outputShape }) {
  const supervised = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: input.organization_id,
    party_id: input.party_id || null,
    entity_id: input.entity_id || null,
    system: creativeSystem(outputShape),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          task,
          input,
          constraints,
          output_shape: outputShape,
        }),
      },
    ],
    tools: [],
    authorization: {
      allow_mutating_tools: false,
    },
    mode: "deep",
    critique_instructions: [
      "Audit the proposed creative JSON as a world-class executive creative director and senior producer.",
      "Repair generic ideas, unsupported claims, brand drift, weak narrative logic, unnecessary generation, missing sound or voice thinking, inappropriate capability choices, avoidable cost, and false quality or completion claims.",
      "Preserve the required JSON schema and return only the corrected JSON object.",
    ].join(" "),
    max_output_tokens: 2800,
    metadata: {
      module: "CREATIVE",
      operation: "CREATIVE_INTELLIGENCE_SUPERVISION",
      creative_task: task,
      capability_only_orchestration: true,
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
    },
  });

  return {
    parsed: supervised.parsed,
    repaired: supervised.repaired === true,
  };
}

async function runGovernedFallback({
  task,
  input,
  constraints,
  outputShape,
  temperature,
}) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    party_id: input.party_id || null,
    entity_id: input.entity_id || null,
    service_id: "ai.reasoning.execute",
    input: {
      input: JSON.stringify({
        task,
        input,
        constraints,
        outputShape,
      }),
      instructions_text: creativeSystem(outputShape),
      temperature,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "REASONING_FALLBACK",
      fallback_from_owned_creative_intelligence: true,
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
  return parseJson(content);
}

export async function reason({
  task,
  input = {},
  constraints = {},
  outputShape = {},
  temperature = 0.7,
}) {
  if (!input.organization_id) {
    throw new Error("CREATIVE_REASONING_ORGANIZATION_REQUIRED");
  }

  try {
    const owned = await runOwnedSupervisor({
      task,
      input,
      constraints,
      outputShape,
    });
    return {
      task,
      confidence: Number(owned.parsed?.confidence || 82),
      execution_source: "avantiqo_intelligence_supervisor",
      raw_reasoning_persisted: false,
      provider_selection_exposed: false,
      intelligence_supervision: {
        owned_first: true,
        owned_supervisor_used: true,
        critique_repair: owned.repaired,
        fallback_used: false,
        raw_reasoning_persisted: false,
      },
      result: owned.parsed?.result || owned.parsed,
    };
  } catch (ownedError) {
    console.warn(
      "CREATIVE_OWNED_INTELLIGENCE_SUPERVISOR_FALLBACK",
      ownedError?.message || ownedError,
    );
  }

  try {
    const parsed = await runGovernedFallback({
      task,
      input,
      constraints,
      outputShape,
      temperature,
    });
    if (parsed) {
      return {
        task,
        confidence: Number(parsed.confidence || 70),
        execution_source: "governed_service_runtime_fallback",
        raw_reasoning_persisted: false,
        provider_selection_exposed: false,
        intelligence_supervision: {
          owned_first: true,
          owned_supervisor_used: false,
          fallback_used: true,
          raw_reasoning_persisted: false,
        },
        result: parsed.result || parsed,
      };
    }
  } catch (fallbackError) {
    console.error(
      "CREATIVE_GOVERNED_REASONING_FALLBACK_FAILED",
      fallbackError?.message || fallbackError,
    );
  }

  return localFallback({ task, input });
}
