import { reason } from "@/lib/marketing/ai/reasoning/ReasoningService";

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function clampScore(value, fallback = 50) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function localScoreIdea(idea, knowledgeGraph) {
  let costScore = 70;
  let realismScore = 70;

  if (idea.production_cost === "low") costScore = 95;
  if (idea.production_cost === "medium") costScore = 75;
  if (idea.production_cost === "high") costScore = 45;

  if (idea.ai_risk === "low") realismScore = 92;
  if (idea.ai_risk === "medium") realismScore = 72;
  if (idea.ai_risk === "high") realismScore = 42;

  const assetFit =
    knowledgeGraph.assets.length > 0 &&
    idea.production_method !== "generated_scene"
      ? 85
      : 55;

  return {
    brand_fit: 75,
    objective_fit: 78,
    audience_fit: 72,
    realism: realismScore,
    cost_efficiency: costScore,
    asset_fit: assetFit,
    originality: 70,
    platform_fit: 75,
  };
}

export async function evaluateCreativeIdeas({
  knowledgeGraph,
  ideas,
}) {
  const evaluations = [];
  const trace = [];

  for (const idea of ideas) {
    const localScores =
      localScoreIdea(
        idea,
        knowledgeGraph
      );

    const reasoning =
      await reason({
        task: "Critique and score one creative idea. Do not select a winner. Return numeric scores only with short risks.",
        input: {
          idea,
          objective:
            knowledgeGraph.objective,
          business:
            knowledgeGraph.business,
          brand:
            knowledgeGraph.brand,
          platform:
            knowledgeGraph.platform,
          duration_seconds:
            knowledgeGraph.duration_seconds,
          available_assets:
            knowledgeGraph.assets.slice(0, 20),
          local_scores:
            localScores,
        },
        constraints:
          knowledgeGraph.constraints,
        outputShape: {
          result: {
            scores: {
              brand_fit: "0-100",
              objective_fit: "0-100",
              audience_fit: "0-100",
              realism: "0-100",
              cost_efficiency: "0-100",
              asset_fit: "0-100",
              originality: "0-100",
              platform_fit: "0-100",
            },
            risks: ["string"],
            missing_data: ["string"],
          },
        },
        temperature: 0.3,
      });

    const scores =
      reasoning?.result?.scores || {};

    const finalScores = {
      brand_fit:
        clampScore(
          scores.brand_fit,
          localScores.brand_fit
        ),
      objective_fit:
        clampScore(
          scores.objective_fit,
          localScores.objective_fit
        ),
      audience_fit:
        clampScore(
          scores.audience_fit,
          localScores.audience_fit
        ),
      realism:
        clampScore(
          scores.realism,
          localScores.realism
        ),
      cost_efficiency:
        clampScore(
          scores.cost_efficiency,
          localScores.cost_efficiency
        ),
      asset_fit:
        clampScore(
          scores.asset_fit,
          localScores.asset_fit
        ),
      originality:
        clampScore(
          scores.originality,
          localScores.originality
        ),
      platform_fit:
        clampScore(
          scores.platform_fit,
          localScores.platform_fit
        ),
    };

    const weightedScore =
      Math.round(
        (
          finalScores.brand_fit * 0.15 +
          finalScores.objective_fit * 0.18 +
          finalScores.audience_fit * 0.12 +
          finalScores.realism * 0.15 +
          finalScores.cost_efficiency * 0.16 +
          finalScores.asset_fit * 0.1 +
          finalScores.originality * 0.07 +
          finalScores.platform_fit * 0.07
        ) *
          idea.weight
      );

    evaluations.push({
      idea_id:
        idea.id,
      problem_id:
        idea.problem_id,
      problem_type:
        idea.problem_type,
      scores:
        finalScores,
      weighted_score:
        weightedScore,
      risks:
        normalizeArray(
          reasoning?.result?.risks
        ),
      missing_data:
        normalizeArray(
          reasoning?.result?.missing_data
        ),
    });

    trace.push({
      idea_id:
        idea.id,
      provider:
        reasoning.provider,
      model:
        reasoning.model,
      confidence:
        reasoning.confidence,
      weighted_score:
        weightedScore,
    });
  }

  return {
    evaluations,
    trace,
  };
}
