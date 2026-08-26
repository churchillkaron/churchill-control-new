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
import {
  evaluateAvantiqoLearningEffectiveness,
} from "@/lib/intelligence/runtime/AvantiqoLearningEffectivenessRuntime";

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

    // Closed-loop Learning order:
    // 1. Synchronize Avantiqo's canonical product truth.
    // 2. Discover product/evidence coverage gaps from that truth.
    // 3. Evaluate whether prior research is productive and adapt priority/cadence.
    // 4. Spend the existing bounded research budget on the resulting agenda.
    // These first three stages are provider-free and never mutate model weights.
    const internalProductKnowledge = await syncAvantiqoInternalProductKnowledge();
    const learningCoverage = await reconcileAvantiqoLearningCoverage();
    const learningEffectiveness = await evaluateAvantiqoLearningEffectiveness();
    const result = await runAvantiqoContinuousLearningBatch({ limit });

    return Response.json(
      {
        ...result,
        internal_product_knowledge: internalProductKnowledge,
        learning_coverage: learningCoverage,
        learning_effectiveness: learningEffectiveness,
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