import { NextResponse } from "next/server";

import analyzeLaborEfficiency from "@/lib/ai-operations/labor/analyzeLaborEfficiency";

import analyzeKitchenEfficiency from "@/lib/ai-operations/kitchen/analyzeKitchenEfficiency";

import analyzeRevenueOptimization from "@/lib/ai-operations/revenue/analyzeRevenueOptimization";

import predictStaffingNeeds from "@/lib/ai-operations/staffing/predictStaffingNeeds";

import runExecutiveAI from "@/lib/ai-finance/executive/runExecutiveAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenant_id =
      body.tenant_id || "demo";

    // ===== OPERATIONS =====
    const [
      labor,
      kitchen,
      revenue,
      staffing,
    ] = await Promise.all([

      analyzeLaborEfficiency({
        tenant_id,
      }),

      analyzeKitchenEfficiency({
        tenant_id,
      }),

      analyzeRevenueOptimization({
        tenant_id,
      }),

      predictStaffingNeeds({
        tenant_id,
      }),
    ]);

    // ===== FINANCE AI =====
    const financeAI =
      await runExecutiveAI({
        tenant_id,
      });

    // ===== DECISION ENGINE =====
    let operationalStatus =
      "HEALTHY";

    const alerts = [];

    if (
      kitchen.kitchen_efficiency < 70
    ) {

      operationalStatus =
        "WARNING";

      alerts.push({

        type:
          "KITCHEN_EFFICIENCY",

        message:
          "Kitchen efficiency below operational threshold.",
      });
    }

    if (
      labor.average_labor_cost > 50000
    ) {

      alerts.push({

        type:
          "LABOR_COST",

        message:
          "Labor costs above optimization threshold.",
      });
    }

    if (
      financeAI.executive_summary
        ?.risk
        ?.risk_level ===
      "HIGH"
    ) {

      operationalStatus =
        "CRITICAL";

      alerts.push({

        type:
          "FINANCIAL_RISK",

        message:
          "High financial risk detected.",
      });
    }

    // ===== AI CONTROL CENTER =====
    return NextResponse.json({

      success: true,

      ai_control_center: {

        operational_status:
          operationalStatus,

        alerts,

        operations: {

          labor,

          kitchen,

          revenue,

          staffing,
        },

        finance:
          financeAI.executive_summary,

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
