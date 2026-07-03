import { reason } from "@/lib/marketing/ai/reasoning/ReasoningService";

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export async function verifyCreativeDecisions({
  knowledgeGraph,
  decisions,
}) {
  const reasoning =
    await reason({
      task: "Verify selected creative decisions before production. Find risks, contradictions, missing assets, AI-looking choices, and cost problems.",
      input: {
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
        budget_mode:
          knowledgeGraph.budget_mode,
        available_assets:
          knowledgeGraph.assets.slice(0, 30),
        decisions,
      },
      constraints:
        knowledgeGraph.constraints,
      outputShape: {
        result: {
          passed: "boolean",
          confidence: "0-100",
          issues: [
            {
              severity: "low | medium | high",
              message: "string",
              affected_decision_id: "string"
            }
          ],
          recommendations: ["string"],
        },
      },
      temperature: 0.2,
    });

  const result =
    reasoning?.result || {};

  const highIssues =
    normalizeArray(result.issues)
      .filter(
        (issue) =>
          issue?.severity === "high"
      );

  return {
    passed:
      result.passed !== false &&
      highIssues.length === 0,
    confidence:
      Number(result.confidence || 75),
    issues:
      normalizeArray(result.issues),
    recommendations:
      normalizeArray(result.recommendations),
    trace: {
      provider:
        reasoning.provider,
      model:
        reasoning.model,
      confidence:
        reasoning.confidence,
    },
  };
}
