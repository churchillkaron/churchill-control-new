import runExecutiveAI from "@/lib/ai-finance/executive/runExecutiveAI";

export default async function runCFOAgent({
  tenant_id,
}) {

  try {

    const finance =
      await runExecutiveAI({
        tenant_id,
      });

    const decisions = [];

    if (
      finance.executive_summary
        ?.risk
        ?.risk_level ===
      "HIGH"
    ) {

      decisions.push({

        action:
          "FREEZE_PROCUREMENT",

        priority:
          "CRITICAL",
      });
    }

    if (
      finance.executive_summary
        ?.cashflow
        ?.net_cashflow < 0
    ) {

      decisions.push({

        action:
          "ENABLE_CASH_PROTECTION",

        priority:
          "HIGH",
      });
    }

    return {

      success: true,

      agent:
        "CFO",

      finance:
        finance.executive_summary,

      decisions,
    };

  } catch (error) {

    return {

      success: false,

      agent:
        "CFO",

      error:
        error.message,
    };
  }
}
