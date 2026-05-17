import buildAIComplianceGovernance from "@/lib/intelligence/compliance/buildAIComplianceGovernance";

import buildAutonomousFinancialGovernance from "@/lib/intelligence/governance/buildAutonomousFinancialGovernance";

export default async function buildAutonomousComplianceEnforcement({
  tenant_id,
}) {

  try {

    const [
      compliance,
      governance,
    ] = await Promise.all([

      buildAIComplianceGovernance({
        tenant_id,
      }),

      buildAutonomousFinancialGovernance({
        tenant_id,
      }),
    ]);

    const enforcementActions = [];

    for (const item of compliance?.violations || []) {

      enforcementActions.push({

        category:
          item.type,

        severity:
          item.severity,

        enforcement:
          item.severity === "HIGH"
            ? "AUTO_RESTRICTED"
            : "MONITORING",

        action:
          item.recommendation,
      });
    }

    for (const item of governance?.governance_actions || []) {

      enforcementActions.push({

        category:
          item.category,

        severity:
          item.severity,

        enforcement:
          item.severity === "HIGH"
            ? "EXECUTIVE_LOCK"
            : "APPROVED",

        action:
          item.action,
      });
    }

    const restricted =
      enforcementActions.some(
        (item) =>
          item.enforcement ===
          "AUTO_RESTRICTED" ||
          item.enforcement ===
          "EXECUTIVE_LOCK"
      );

    return {

      success: true,

      enforcement_status:
        restricted
          ? "ENFORCEMENT_ACTIVE"
          : "CLEAR",

      enforcement_actions:
        enforcementActions,

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
