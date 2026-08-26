export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  runAvantiqoContinuousLearningBatch,
} from "@/lib/intelligence/runtime/AvantiqoContinuousLearningRuntime";
import {
  syncAvantiqoInternalProductKnowledge,
} from "@/lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime";
import {
  reconcileAvantiqoLearningCoverage,
} from "@/lib/intelligence/runtime/AvantiqoLearningCoverageRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit")) || 1, 3),
    );

    // First synchronize Avantiqo's canonical product truth. Then recompute Learning
    // coverage from that truth plus verified reusable evidence and runtime learning
    // signals. Only after those provider-free steps do we spend the bounded research
    // budget, ensuring external learning follows the current highest-value product gaps.
    const internalProductKnowledge = await syncAvantiqoInternalProductKnowledge();
    const learningCoverage = await reconcileAvantiqoLearningCoverage();
    const result = await runAvantiqoContinuousLearningBatch({ limit });

    return Response.json(
      {
        ...result,
        internal_product_knowledge: internalProductKnowledge,
        learning_coverage: learningCoverage,
      },
      {
        status: result.success === false ? 207 : 200,
      },
    );
  } catch (error) {
    console.error("AVANTIQO_CONTINUOUS_LEARNING_CRON_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Continuous learning failed",
      },
      { status: 500 },
    );
  }
}