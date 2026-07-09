/**
 * PLATFORM BUSINESS OPTIMIZATION ENGINE
 *
 * Finds:
 * - low margin organizations
 * - supplier cost risks
 * - pricing opportunities
 */

export function optimizeSaaSBusiness({
  organizations = [],
}) {

  const recommendations = [];


  for (const organization of organizations) {

    const margin =
      Number(
        organization.margin || 0
      );


    const supplierCost =
      Number(
        organization.supplierCost || 0
      );


    const revenue =
      Number(
        organization.revenue || 0
      );


    if (margin < 30) {

      recommendations.push({

        organizationId:
          organization.organizationId,

        name:
          organization.name,

        severity:
          "high",

        type:
          "LOW_MARGIN_CLIENT",

        message:
          `${organization.name} has low margin at ${margin}%. Review pricing or service usage.`,

      });

    }


    if (
      supplierCost >
      revenue * 0.4
    ) {

      recommendations.push({

        organizationId:
          organization.organizationId,

        name:
          organization.name,

        severity:
          "critical",

        type:
          "SUPPLIER_COST_RISK",

        message:
          `${organization.name} supplier cost is too high compared to revenue.`,

      });

    }

  }


  return {

    recommendations,

    count:
      recommendations.length,

    status:
      recommendations.length
        ? "attention_required"
        : "healthy",

  };

}
