import { orchestrateSignal } from "@/lib/orchestration/orchestrateSignal";

import { runAIDecision } from "@/lib/ai/runtime/runAIDecision";

export async function processSignal({

  signal,

}) {

  console.log(
    "[PROCESS_SIGNAL]",
    signal.type
  );

  const aiResult =
    await runAIDecision({

      type:
        signal.type,

      payload:
        signal.payload,

    });

  const orchestration =
    await orchestrateSignal({

      signal,

    });

  return {

    success: true,

    aiResult,

    orchestration,

  };

}
