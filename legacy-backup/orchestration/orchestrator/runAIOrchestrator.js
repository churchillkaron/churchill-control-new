import runCFOAgent from "@/lib/ai-agents/cfo/runCFOAgent";

import runCOOAgent from "@/lib/ai-agents/coo/runCOOAgent";

import runProcurementAgent from "@/lib/ai-agents/procurement/runProcurementAgent";

import runKitchenAgent from "@/lib/ai-agents/kitchen/runKitchenAgent";

import runHRAgent from "@/lib/ai-agents/hr/runHRAgent";

export default async function runAIOrchestrator({
  tenant_id,
}) {

  try {

    const [
      cfo,
      coo,
      procurement,
      kitchen,
      hr,
    ] = await Promise.all([

      runCFOAgent({
        tenant_id,
      }),

      runCOOAgent({
        tenant_id,
      }),

      runProcurementAgent({
        tenant_id,
      }),

      runKitchenAgent({
        tenant_id,
      }),

      runHRAgent({
        tenant_id,
      }),
    ]);

    const escalations = [];

    if (
      cfo.decisions?.some(
        (
          d
        ) =>
          d.priority ===
          "CRITICAL"
      )
    ) {

      escalations.push({

        source:
          "CFO",

        level:
          "CRITICAL",

        message:
          "Financial emergency escalation.",
      });
    }

    return {

      success: true,

      orchestrator: {

        agents: {

          cfo,

          coo,

          procurement,

          kitchen,

          hr,
        },

        escalations,

        generated_at:
          new Date().toISOString(),
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
