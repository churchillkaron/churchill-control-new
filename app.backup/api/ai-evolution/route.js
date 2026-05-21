import { NextResponse } from "next/server";

import runAdaptiveLearning from "@/lib/ai-memory/learning/runAdaptiveLearning";

import generateDynamicThresholds from "@/lib/ai-evolution/thresholds/generateDynamicThresholds";

import calculateAIScore from "@/lib/ai-evolution/scoring/calculateAIScore";

import runPredictiveOptimization from "@/lib/ai-evolution/optimization/runPredictiveOptimization";

import runStrategyAdjustment from "@/lib/ai-evolution/strategy/runStrategyAdjustment";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenant_id =
      body.tenant_id || "demo";

    const learning =
      await runAdaptiveLearning({
        tenant_id,
      });

    const thresholds =
      await generateDynamicThresholds({
        tenant_id,
      });

    const aiScore =
      await calculateAIScore({
        learning:
          learning.learning,
      });

    const optimization =
      await runPredictiveOptimization({

        ai_score:
          aiScore,

        thresholds,
      });

    const strategy =
      await runStrategyAdjustment({

        optimization,
      });

    return NextResponse.json({

      success: true,

      evolution: {

        learning:
          learning.learning,

        thresholds:
          thresholds.thresholds,

        ai_score:
          aiScore,

        optimization:
          optimization.optimizations,

        strategy:
          strategy.strategy,

        generated_at:
          new Date().toISOString(),
      },
    });

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
