export default async function generateFinancialRecommendations({
  cashflow,
  risk,
}) {

  try {

    const recommendations = [];

    if (
      cashflow.net_cashflow < 0
    ) {

      recommendations.push({

        type:
          "CASHFLOW_WARNING",

        message:
          "Negative cash flow detected. Reduce operational expenses.",
      });
    }

    if (
      risk.risk_level ===
      "HIGH"
    ) {

      recommendations.push({

        type:
          "HIGH_LIABILITY",

        message:
          "Liabilities are critically high. Delay non-essential procurement.",
      });
    }

    if (
      recommendations.length === 0
    ) {

      recommendations.push({

        type:
          "HEALTHY",

        message:
          "Financial indicators currently stable.",
      });
    }

    return {

      success: true,

      recommendations,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
