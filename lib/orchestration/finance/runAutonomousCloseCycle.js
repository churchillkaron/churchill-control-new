import { supabase } from "@/lib/supabase";

import { runContinuousClose } from "./runContinuousClose";
import { runRiskScoring } from "./runRiskScoring";
import { runExecutiveIntelligence } from "./runExecutiveIntelligence";

export async function runAutonomousCloseCycle({
  tenantId,
  closePeriod,
}) {
  const closeCheck =
    await runContinuousClose({
      tenantId,
      closePeriod,
    });

  const risk =
    await runRiskScoring({
      tenantId,
    });

  const intelligence =
    await runExecutiveIntelligence({
      tenantId,
    });

  const totalControls =
    closeCheck.checks.length;

  const passedControls =
    closeCheck.checks.filter(
      (c) => c.passed
    ).length;

  const failedControls =
    totalControls -
    passedControls;

  let readinessScore =
    (passedControls /
      Math.max(
        totalControls,
        1
      )) *
    100;

  readinessScore -=
    Number(
      risk.overall_risk || 0
    ) * 0.25;

  readinessScore =
    Math.max(
      0,
      Math.min(
        100,
        readinessScore
      )
    );

  let recommendation =
    "DO_NOT_CLOSE";

  if (
    readinessScore >= 85 &&
    intelligence.executiveStatus !==
      "critical"
  ) {
    recommendation =
      "READY_TO_CLOSE";
  }

  const { data, error } =
    await supabase
      .from(
        "accounting_autonomous_close_cycles"
      )
      .insert({
        tenant_id: tenantId,
        close_period:
          closePeriod,
        cycle_status:
          recommendation,
        readiness_score:
          readinessScore,
        total_controls:
          totalControls,
        passed_controls:
          passedControls,
        failed_controls:
          failedControls,
        ai_recommendation:
          recommendation,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    cycle: data,
    risk,
    intelligence,
  };
}
