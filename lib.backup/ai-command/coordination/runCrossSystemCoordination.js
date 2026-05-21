export default async function runCrossSystemCoordination({
  monitoring,
  ai_operations,
  ai_finance,
}) {

  try {

    const actions = [];

    // ===== PROCUREMENT =====
    if (
      monitoring.low_stock_items > 3
    ) {

      actions.push({

        system:
          "PROCUREMENT",

        action:
          "GENERATE_PURCHASE_ORDER",
      });
    }

    // ===== STAFFING =====
    if (
      ai_operations.operations
        ?.staffing
        ?.recommended_staff > 5
    ) {

      actions.push({

        system:
          "HR",

        action:
          "INCREASE_STAFFING",
      });
    }

    // ===== FINANCE =====
    if (
      ai_finance.procurement_decision ===
      "RESTRICT_PROCUREMENT"
    ) {

      actions.push({

        system:
          "PROCUREMENT",

        action:
          "FREEZE_NON_ESSENTIAL_SPENDING",
      });
    }

    return {

      success: true,

      actions,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
