import { NextResponse } from "next/server";

import runExecutiveAI from "@/lib/ai-finance/executive/runExecutiveAI";

import runEnterpriseMonitoring from "@/lib/ai-command/monitoring/runEnterpriseMonitoring";

import runAutonomousProcurement from "@/lib/ai-execution/procurement/runAutonomousProcurement";

import runAutonomousFinanceProtection from "@/lib/ai-execution/finance/runAutonomousFinanceProtection";

import runAutonomousStaffing from "@/lib/ai-execution/staffing/runAutonomousStaffing";

import runAutonomousOperations from "@/lib/ai-execution/operations/runAutonomousOperations";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenant_id =
      body.tenant_id || "demo";

    // ===== AI CFO =====
    const financeAI =
      await runExecutiveAI({
        tenant_id,
      });

    // ===== MONITORING =====
    const monitoring =
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

    const operationsAI =
      await operationsResponse.json();

    // ===== AUTONOMOUS ACTIONS =====
    const procurement =
      await runAutonomousProcurement({

        tenant_id,

        ai_finance:
          financeAI.executive_summary,

        monitoring:
          monitoring.monitoring,
      });

    const finance =
      await runAutonomousFinanceProtection({

        ai_finance:
          financeAI.executive_summary,
      });

    const staffing =
      await runAutonomousStaffing({

        ai_operations:
          operationsAI.ai_control_center,
      });

    const operations =
      await runAutonomousOperations({

        ai_operations:
          operationsAI.ai_control_center,
      });

    return NextResponse.json({

      success: true,

      autonomous_execution: {

        procurement,

        finance,

        staffing,

        operations,

        executed_at:
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
