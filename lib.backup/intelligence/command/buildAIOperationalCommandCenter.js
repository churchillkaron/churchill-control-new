import buildAutonomousExecutiveDecisionEngine from "@/lib/intelligence/executive/decision/buildAutonomousExecutiveDecisionEngine";

import buildSelfHealingInfrastructure from "@/lib/intelligence/healing/buildSelfHealingInfrastructure";

import buildAutonomousFinancialGovernance from "@/lib/intelligence/governance/buildAutonomousFinancialGovernance";

import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

export default async function buildAIOperationalCommandCenter({
  tenant_id,
}) {

  try {

    const [
      executive,
      healing,
      governance,
      anomaly,
    ] = await Promise.all([

      buildAutonomousExecutiveDecisionEngine({
        tenant_id,
      }),

      buildSelfHealingInfrastructure({
        tenant_id,
      }),

      buildAutonomousFinancialGovernance({
        tenant_id,
      }),

      buildPredictiveAnomalyEngine({
        tenant_id,
      }),
    ]);

    const commandState = {

      operational_status:
        "OPTIMAL",

      alerts: [],

      recommendations: [],
    };

    if (
      anomaly?.anomaly_count > 0
    ) {

      commandState.operational_status =
        "MONITORING";

      commandState.alerts.push({

        type:
          "ANOMALY_ALERT",

        message:
          `${anomaly.anomaly_count} active anomalies detected.`,
      });
    }

    if (
      healing?.infrastructure_status ===
      "SELF_HEALING_ACTIVE"
    ) {

      commandState.operational_status =
        "SELF_HEALING";

      commandState.alerts.push({

        type:
          "RECOVERY_ACTIVE",

        message:
          "Infrastructure recovery workflows currently active.",
      });
    }

    if (
      governance?.governance_status ===
      "RESTRICTED"
    ) {

      commandState.operational_status =
        "GOVERNANCE_RESTRICTED";

      commandState.alerts.push({

        type:
          "FINANCIAL_GOVERNANCE",

        message:
          "Governance restrictions currently active.",
      });
    }

    for (const item of executive?.decisions || []) {

      commandState.recommendations.push({

        category:
          item.type,

        decision:
          item.decision,

        confidence:
          item.confidence,
      });
    }

    return {

      success: true,

      command_center:
        commandState,

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
