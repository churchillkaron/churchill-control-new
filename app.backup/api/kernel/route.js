import { NextResponse } from "next/server";

import runKernelOrchestrator from "@/lib/kernel/orchestration/runKernelOrchestrator";

import runLifecycleManager from "@/lib/kernel/lifecycle/runLifecycleManager";

import runKernelSecurity from "@/lib/kernel/security/runKernelSecurity";

import runEnterpriseConsciousness from "@/lib/kernel/consciousness/runEnterpriseConsciousness";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenant_id =
      body.tenant_id || "demo";

    const orchestrator =
      await runKernelOrchestrator({
        tenant_id,
      });

    const lifecycle =
      await runLifecycleManager({

        runtime_status:
          orchestrator
            .orchestration
            ?.runtime
            ?.runtime_status ||
          "HEALTHY",
      });

    const security =
      await runKernelSecurity({

        state:
          orchestrator
            .orchestration
            ?.state,
      });

    const consciousness =
      await runEnterpriseConsciousness({

        orchestration:
          orchestrator
            .orchestration,

        lifecycle,

        security,
      });

    return NextResponse.json({

      success: true,

      kernel: {

        orchestrator,

        lifecycle,

        security,

        consciousness,
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
