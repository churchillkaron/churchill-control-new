import runAIOrchestrator from "@/lib/ai-agents/orchestrator/runAIOrchestrator";

import runHealthMonitor from "@/lib/runtime/health/runHealthMonitor";

import getEnterpriseState from "@/lib/kernel/state/getEnterpriseState";

export default async function runKernelOrchestrator({
  tenant_id,
}) {

  try {

    const state =
      await getEnterpriseState({
        tenant_id,
      });

    const ai =
      await runAIOrchestrator({
        tenant_id,
      });

    const runtime =
      await runHealthMonitor();

    return {

      success: true,

      orchestration: {

        state:
          state.state,

        ai:
          ai.orchestrator,

        runtime:
          runtime.health,

        synchronized_at:
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
