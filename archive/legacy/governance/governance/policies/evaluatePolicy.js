export default async function evaluatePolicy({
  action_type,
  priority = "NORMAL",
  amount = 0,
}) {

  try {

    let approvalRequired =
      false;

    let riskLevel =
      "LOW";

    // ===== PROCUREMENT =====
    if (
      action_type ===
      "PROCUREMENT"
    ) {

      if (
        amount > 50000
      ) {

        approvalRequired =
          true;

        riskLevel =
          "HIGH";
      }
    }

    // ===== FINANCE =====
    if (
      action_type ===
      "FINANCE"
    ) {

      approvalRequired =
        true;

      riskLevel =
        "CRITICAL";
    }

    // ===== CRITICAL =====
    if (
      priority ===
      "CRITICAL"
    ) {

      approvalRequired =
        true;

      riskLevel =
        "CRITICAL";
    }

    return {

      success: true,

      policy: {

        action_type,

        approval_required:
          approvalRequired,

        risk_level:
          riskLevel,
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
