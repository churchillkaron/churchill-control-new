import {
  buildKnowledgeGraph,
  decomposeCreativeProblems,
} from "@/lib/marketing/ai/intelligence/KnowledgeEngine";

import { exploreCreativeOptions } from "@/lib/marketing/ai/intelligence/SearchEngine";
import { evaluateCreativeIdeas } from "@/lib/marketing/ai/intelligence/EvaluationEngine";
import { selectCreativeDecisions } from "@/lib/marketing/ai/intelligence/DecisionEngine";
import { verifyCreativeDecisions } from "@/lib/marketing/ai/intelligence/VerificationEngine";
import { buildProductionGraph } from "@/lib/marketing/ai/intelligence/ProductionEngine";

export async function CreativeSearchRuntime({
  organizationId,
  pageId,
  objective,
  platform = "facebook",
  durationSeconds = 30,
  budgetMode = "cost-effective",
  business = {},
  brand = {},
  assets = [],
  campaignMemory = [],
  performanceMemory = [],
  userInput = {},
}) {
  const startedAt =
    new Date().toISOString();

  const knowledgeGraph =
    buildKnowledgeGraph({
      organizationId,
      pageId,
      objective,
      platform,
      durationSeconds,
      budgetMode,
      business,
      brand,
      assets,
      campaignMemory,
      performanceMemory,
      userInput,
    });

  const problems =
    decomposeCreativeProblems(
      knowledgeGraph
    );

  const search =
    await exploreCreativeOptions({
      knowledgeGraph,
      problems,
      ideasPerProblem:
        Number(
          process.env.AVANTIQO_IDEAS_PER_PROBLEM ||
          8
        ),
    });

  const evaluation =
    await evaluateCreativeIdeas({
      knowledgeGraph,
      ideas: search.ideas,
    });

  const decision =
    selectCreativeDecisions({
      ideas: search.ideas,
      evaluations:
        evaluation.evaluations,
      maxPerProblem: 1,
    });

  const verification =
    await verifyCreativeDecisions({
      knowledgeGraph,
      decisions:
        decision.decisions,
    });

  const productionGraph =
    buildProductionGraph({
      knowledgeGraph,
      decisions:
        decision.decisions,
      verification,
    });

  return {
    success: true,
    runtime:
      "creative-search-runtime-v2",
    started_at:
      startedAt,
    completed_at:
      new Date().toISOString(),
    knowledge_graph:
      knowledgeGraph,
    problem_graph:
      problems,
    candidate_graph: {
      ideas:
        search.ideas,
      trace:
        search.trace,
    },
    evaluation_graph: {
      evaluations:
        evaluation.evaluations,
      trace:
        evaluation.trace,
    },
    decision_graph: {
      confidence:
        decision.confidence,
      decisions:
        decision.decisions,
    },
    verification_graph:
      verification,
    production_graph:
      productionGraph,
  };
}
