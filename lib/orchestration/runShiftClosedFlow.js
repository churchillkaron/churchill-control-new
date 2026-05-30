import { supabase } from "@/lib/supabase";

import { distributeServiceCharge } from "@/lib/payroll/core/distributeServiceCharge";
import { allocateLaborCost } from "@/lib/payroll/core/allocateLaborCost";
import { runShiftProfitability } from "@/lib/production/core/runShiftProfitability";

export async function runShiftClosedFlow({
  tenantId,
  shiftName,
  revenue,
  laborCost,
  serviceCharge,
}) {
  const executionSteps = [];

  executionSteps.push(
    "SERVICE_CHARGE_DISTRIBUTED"
  );

  await distributeServiceCharge({
    tenantId,
    distributionPeriod:
      shiftName,
    totalServiceCharge:
      serviceCharge,
  });

  executionSteps.push(
    "LABOR_ALLOCATED"
  );

  await allocateLaborCost({
    tenantId,
    shiftName,
    department: "FOH",
    laborCost,
    revenue,
  });

  executionSteps.push(
    "SHIFT_PROFITABILITY_UPDATED"
  );

  await runShiftProfitability({
    tenantId,
    shiftName,
    revenue,
    foodCost: 0,
    laborCost,
  });

  return {
    success: true,
    executionSteps,
  };
}
