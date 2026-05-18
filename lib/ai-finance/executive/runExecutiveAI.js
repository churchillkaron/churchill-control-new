import predictCashFlow from "@/lib/ai-finance/cashflow/predictCashFlow";

import detectFinancialRisk from "@/lib/ai-finance/risk/detectFinancialRisk";

import generateFinancialRecommendations from "@/lib/ai-finance/recommendations/generateFinancialRecommendations";

import analyzeReplenishmentNeeds from "@/lib/procurement/replenishment/analyzeReplenishmentNeeds";

export default async function runExecutiveAI({
  tenant_id,
}) {

  try {

    // ===== FINANCIAL ANALYSIS =====
    const cashflow =
      await predictCashFlow({
        tenant_id,
      });

    const risk =
      await detectFinancialRisk({
        tenant_id,
      });

    const recommendations =
      await generateFinancialRecommendations({

        cashflow,

        risk,
      });

    // ===== PROCUREMENT EXPOSURE =====
    const replenishment =
      await analyzeReplenishmentNeeds({

        tenant_id,
      });

    let procurementExposure = 0;

    for (const item of replenishment.recommendations || []) {

      procurementExposure +=
        Number(
          item.recommended_purchase || 0
        );
    }

    // ===== AI DECISION =====
    let procurementDecision =
      "APPROVED";

    if (
      risk.risk_level ===
      "HIGH"
    ) {

      procurementDecision =
        "RESTRICT_PROCUREMENT";
    }

    if (
      cashflow.net_cashflow < 0
    ) {

      procurementDecision =
        "CASHFLOW_WARNING";
    }

    // ===== EXECUTIVE SUMMARY =====
    return {

      success: true,

      executive_summary: {

        cashflow,

        risk,

        recommendations,

        procurement_exposure:
          procurementExposure,

        procurement_decision:
          procurementDecision,

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
