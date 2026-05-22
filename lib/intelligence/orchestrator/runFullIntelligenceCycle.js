import buildExecutiveOverview
from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations
from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import buildPerformanceInsights
from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildRevenueForecast
from "@/lib/finance/forecasting/buildRevenueForecast";

import buildPayrollIntelligence
from "@/lib/intelligence/payroll/buildPayrollIntelligence";

import buildAccountingIntelligence
from "@/lib/intelligence/accounting/buildAccountingIntelligence";

import buildOperationalHealth
from "@/lib/intelligence/operations/buildOperationalHealth";

import buildAutonomousFinancialGovernance
from "@/lib/intelligence/governance/buildAutonomousFinancialGovernance";

import storeInsightMemory
from "@/lib/intelligence/memory/storeInsightMemory";

import createAlert
from "@/lib/alerts/createAlert";

export default async function runFullIntelligenceCycle({

  tenant_id,

}) {

  try {

    // =====================================
    // TIER 1 — CORE OPERATIONS
    // =====================================

    const [

      executive,

      recommendations,

      performance,

      forecast,

    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildOperationalRecommendations({
        tenant_id,
      }),

      buildPerformanceInsights({
        tenant_id,
      }),

      buildRevenueForecast({
        tenant_id,
      }),

    ]);

    // =====================================
    // TIER 2 — FINANCIAL + PAYROLL
    // =====================================

    const [

      payroll,

      accounting,

    ] = await Promise.all([

      buildPayrollIntelligence({
        tenant_id,
      }),

      buildAccountingIntelligence({
        tenant_id,
      }),

    ]);

    // =====================================
    // TIER 3 — OPERATIONAL HEALTH
    // =====================================

    const operationalHealth =
      await buildOperationalHealth({
        tenant_id,
      });

    // =====================================
    // TIER 4 — GOVERNANCE
    // =====================================

    const governance =
      await buildAutonomousFinancialGovernance({
        tenant_id,
      });

    // =====================================
    // EXECUTIVE REPORT
    // =====================================

    const report = {

      executive,

      recommendations,

      performance,

      forecast,

      payroll,

      accounting,

      operationalHealth,

      governance,

      generated_at:
        new Date()
          .toISOString(),

    };

    // =====================================
    // MEMORY STORAGE
    // =====================================

    await storeInsightMemory({

      tenant_id,

      category:
        "full_intelligence_cycle",

      payload:
        report,

    });

    // =====================================
    // CRITICAL ALERTING
    // =====================================

    const criticalAlerts = [];

    if (
      performance.performance ===
      "CRITICAL"
    ) {

      criticalAlerts.push(
        "Critical operational performance detected"
      );

    }

    if (
      payroll.payroll_health < 50
    ) {

      criticalAlerts.push(
        "Payroll health critically low"
      );

    }

    if (
      governance.risk_level ===
      "CRITICAL"
    ) {

      criticalAlerts.push(
        "Critical governance risk detected"
      );

    }

    for (
      const message of criticalAlerts
    ) {

      await createAlert({

        tenant_id,

        severity:
          "critical",

        message,

      });

    }

    // =====================================
    // RETURN
    // =====================================

    return {

      success: true,

      intelligence_layers: {

        executive:
          true,

        operations:
          true,

        payroll:
          true,

        accounting:
          true,

        governance:
          true,

        forecasting:
          true,

      },

      report,

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,

    };

  }

}
