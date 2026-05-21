import { NextResponse } from "next/server";

import runEnterpriseMonitoring from "@/lib/ai-command/monitoring/runEnterpriseMonitoring";

import runDecisionEscalation from "@/lib/ai-command/escalation/runDecisionEscalation";

import runCrossSystemCoordination from "@/lib/ai-command/coordination/runCrossSystemCoordination";

import runExecutiveAI from "@/lib/ai-finance/executive/runExecutiveAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenant_id =
      body.tenant_id || "demo";

    // ===== MONITORING =====
    const monitoringResult =
      await runEnterpriseMonitoring({
        tenant_id,
      });

    // ===== OPERATIONS AI =====
    const operationsResponse =
      await fetch(
        "http://localhost:3000/api/ai-operations",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            tenant_id,
          }),
        }
      );

    const operationsJson =
      await operationsResponse.json();

    // ===== FINANCE AI =====
    const financeAI =
      await runExecutiveAI({
        tenant_id,
      });

    // ===== ESCALATION =====
    const escalation =
      await runDecisionEscalation({

        monitoring:
          monitoringResult.monitoring,

        ai_operations:
          operationsJson.ai_control_center,

        ai_finance:
          financeAI.executive_summary,
      });

    // ===== COORDINATION =====
    const coordination =
      await runCrossSystemCoordination({

        monitoring:
          monitoringResult.monitoring,

        ai_operations:
          operationsJson.ai_control_center,

        ai_finance:
          financeAI.executive_summary,
      });

    return NextResponse.json({

      success: true,

      command_center: {

        monitoring:
          monitoringResult.monitoring,

        operations:
          operationsJson.ai_control_center,

        finance:
          financeAI.executive_summary,

        escalation:
          escalation.escalations,

        coordination:
          coordination.actions,

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
