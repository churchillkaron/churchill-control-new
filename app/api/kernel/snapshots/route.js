import { NextResponse } from "next/server";

import createKernelSnapshot from "@/lib/kernel/snapshots/createKernelSnapshot";

import getKernelHistory from "@/lib/kernel/history/getKernelHistory";

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

    // ===== RUN KERNEL =====
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

    const kernel_state = {

      orchestrator,

      lifecycle,

      security,

      consciousness,
    };

    // ===== SAVE SNAPSHOT =====
    const snapshot =
      await createKernelSnapshot({

        tenant_id,

        kernel_state,
      });

    return NextResponse.json({

      success: true,

      snapshot,
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

export async function GET(req) {

  try {

    const tenant_id =
      req.nextUrl.searchParams.get(
        "tenant_id"
      ) || "demo";

    const history =
      await getKernelHistory({

        tenant_id,
      });

    return NextResponse.json(
      history
    );

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
