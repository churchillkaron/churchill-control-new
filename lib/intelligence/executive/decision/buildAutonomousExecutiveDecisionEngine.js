import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

import buildAIStrategicPlanningEngine from "@/lib/intelligence/strategy/buildAIStrategicPlanningEngine";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

import buildAIComplianceGovernance from "@/lib/intelligence/compliance/buildAIComplianceGovernance";

export default async function buildAutonomousExecutiveDecisionEngine({
  tenant_id,
}) {

  try {

    const [
      anomaly,
      strategy,
      investor,
      compliance,
    ] = await Promise.all([

      buildPredictiveAnomalyEngine({
        tenant_id,
      }),

      buildAIStrategicPlanningEngine({
        tenant_id,
      }),

      buildInvestorIntelligenceEngine({
        tenant_id,
      }),

      buildAIComplianceGovernance({
        tenant_id,
      }),
    ]);

    const decisions = [];

    const investmentScore =
      Number(
        investor?.investor_snapshot
          ?.investment_score || 0
      );

    const complianceScore =
      Number(
        compliance
          ?.compliance_summary
          ?.score || 0
      );

    const anomalyCount =
      Number(
        anomaly?.anomaly_count || 0
      );

    if (
      investmentScore > 75 &&
      complianceScore > 80
    ) {

      decisions.push({

        type:
          "EXECUTE_EXPANSION",

        confidence:
          "HIGH",

        decision:
          "AI recommends controlled business expansion and investment acceleration.",
      });
    }

    if (
      anomalyCount > 3
    ) {

      decisions.push({

        type:
          "OPERATIONAL_INTERVENTION",

        confidence:
          "HIGH",

        decision:
          "AI recommends immediate executive operational review.",
      });
    }

    if (
      complianceScore < 70
    ) {

      decisions.push({

        type:
          "COMPLIANCE_LOCKDOWN",

        confidence:
          "HIGH",

        decision:
          "AI recommends temporary compliance escalation procedures.",
      });
    }

    for (const item of strategy?.strategies || []) {

      decisions.push({

        type:
          item.category,

        confidence:
          item.priority,

        decision:
          item.objective,
      });
    }

    return {

      success: true,

      executive_summary: {

        investment_score:
          investmentScore,

        compliance_score:
          complianceScore,

        anomaly_count:
          anomalyCount,
      },

      decisions,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
