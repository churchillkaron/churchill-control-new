import buildAutonomousAccountingClose from "@/lib/intelligence/finance/close/buildAutonomousAccountingClose";

import buildAIComplianceGovernance from "@/lib/intelligence/compliance/buildAIComplianceGovernance";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

export default async function buildAutonomousFinancialGovernance({
  tenant_id,
}) {

  try {

    const [
      accounting,
      compliance,
      investor,
    ] = await Promise.all([

      buildAutonomousAccountingClose({
        tenant_id,
      }),

      buildAIComplianceGovernance({
        tenant_id,
      }),

      buildInvestorIntelligenceEngine({
        tenant_id,
      }),
    ]);

    const governanceActions = [];

    const closeStatus =
      accounting
        ?.accounting_close
        ?.close_status;

    const complianceScore =
      Number(
        compliance
          ?.compliance_summary
          ?.score || 0
      );

    const investmentScore =
      Number(
        investor
          ?.investor_snapshot
          ?.investment_score || 0
      );

    if (
      closeStatus !==
      "READY_TO_CLOSE"
    ) {

      governanceActions.push({

        category:
          "FINANCIAL_LOCK",

        severity:
          "HIGH",

        action:
          "Financial close blocked until accounting discrepancies are resolved.",
      });
    }

    if (
      complianceScore < 75
    ) {

      governanceActions.push({

        category:
          "COMPLIANCE_REVIEW",

        severity:
          "HIGH",

        action:
          "Mandatory compliance escalation procedures activated.",
      });
    }

    if (
      investmentScore > 80 &&
      complianceScore > 85
    ) {

      governanceActions.push({

        category:
          "EXPANSION_APPROVAL",

        severity:
          "LOW",

        action:
          "AI governance approves controlled strategic expansion.",
      });
    }

    if (
      governanceActions.length === 0
    ) {

      governanceActions.push({

        category:
          "SYSTEM_APPROVED",

        severity:
          "LOW",

        action:
          "Financial governance systems operating within approved thresholds.",
      });
    }

    return {

      success: true,

      governance_status:
        governanceActions.some(
          (item) =>
            item.severity ===
            "HIGH"
        )
          ? "RESTRICTED"
          : "APPROVED",

      governance_actions:
        governanceActions,

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
