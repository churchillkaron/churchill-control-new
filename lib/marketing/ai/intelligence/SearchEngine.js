import { reason } from "@/lib/marketing/ai/reasoning/ReasoningService";

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export async function exploreCreativeOptions({
  knowledgeGraph,
  problems,
  ideasPerProblem = 12,
}) {
  const allIdeas = [];
  const trace = [];

  for (const problem of problems) {
    const reasoning =
      await reason({
        task: "Explore many possible creative solutions for one advertising problem. Do not choose. Do not write prompts.",
        input: {
          problem,
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
            knowledgeGraph.assets.slice(0, 20),
          memory:
            knowledgeGraph.memory,
        },
        constraints:
          knowledgeGraph.constraints,
        outputShape: {
          result: {
            ideas: [
              {
                title: "string",
                description: "string",
                production_method: "existing_asset | generated_scene | edit | motion_graphic | mixed",
                required_assets: ["string"],
                assumptions: ["string"],
                risks: ["string"],
                ai_risk: "low | medium | high",
                production_cost: "low | medium | high",
              },
            ],
          },
        },
        temperature: 0.9,
      });

    const ideas =
      normalizeArray(
        reasoning?.result?.ideas
      )
        .slice(0, ideasPerProblem)
        .map((idea, index) => ({
          id:
            `${problem.id}_idea_${String(index + 1).padStart(2, "0")}`,
          problem_id:
            problem.id,
          problem_type:
            problem.type,
          need:
            problem.need,
          weight:
            problem.weight,
          title:
            idea.title || "Untitled idea",
          description:
            idea.description || "",
          production_method:
            idea.production_method || "mixed",
          required_assets:
            normalizeArray(idea.required_assets),
          assumptions:
            normalizeArray(idea.assumptions),
          risks:
            normalizeArray(idea.risks),
          ai_risk:
            idea.ai_risk || "medium",
          production_cost:
            idea.production_cost || "medium",
          status:
            "candidate",
        }));

    allIdeas.push(...ideas);

    trace.push({
      problem_id:
        problem.id,
      task:
        reasoning.task,
      provider:
        reasoning.provider,
      model:
        reasoning.model,
      confidence:
        reasoning.confidence,
      idea_count:
        ideas.length,
    });
  }

  return {
    ideas:
      allIdeas,
    trace,
  };
}
