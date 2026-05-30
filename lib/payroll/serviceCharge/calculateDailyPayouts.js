import loadTenantPayoutPolicy from "@/lib/payroll/policies/loadTenantPayoutPolicy";

import { generateKitchenOperationalReport }
from "@/lib/kitchen/generateKitchenOperationalReport";
export default async function calculateDailyPayouts({

  tenantId,

  serviceCharge = 0,

  staffPerformance = [],

}) {

  const policy =
    await loadTenantPayoutPolicy(
      tenantId
    );

  const kitchenPerformance =
    await generateKitchenOperationalReport({

      tenantId,

    });

  const kitchenLevel =
    kitchenPerformance?.kitchenLevel || "GOOD";

  const payoutModel =
    policy?.payout_model ||
    "EQUAL";

  // =========================
  // EQUAL SPLIT
  // =========================

  if (
    payoutModel ===
    "EQUAL"
  ) {

    const split =
      serviceCharge /
      Math.max(
        1,
        staffPerformance.length
      );

    return staffPerformance.map(
      member => {

        const multiplier =
          policy?.performance_enabled

            ? Number(
                member.multiplier || 1
              )

            : 1;

        return {

          ...member,

          payout:
            Number(
              (
                split *
                multiplier
              ).toFixed(2)
            ),

        };

      }
    );

  }

  // =========================
  // DEPARTMENT SPLIT
  // =========================

  let kitchenMultiplier = 1;

  let globalServiceMultiplier = 1;

  if (
    kitchenLevel === "WARNING"
  ) {

    kitchenMultiplier = 0.9;
    globalServiceMultiplier = 0.95;

  } else if (
    kitchenLevel === "BAD"
  ) {

    kitchenMultiplier = 0.7;
    globalServiceMultiplier = 0.85;

  } else if (
    kitchenLevel === "CRITICAL"
  ) {

    kitchenMultiplier = 0.4;
    globalServiceMultiplier = 0.7;

  }

  const departmentPools = {

    FOH:
      (serviceCharge * globalServiceMultiplier) *
      (
        Number(
          policy?.foh_percentage || 0
        ) / 100
      ),

    BAR:
      (serviceCharge * globalServiceMultiplier) *
      (
        Number(
          policy?.bar_percentage || 0
        ) / 100
      ),

    KITCHEN:
      (
        serviceCharge *
        (
          Number(
            policy?.kitchen_percentage || 0
          ) / 100
        )
      ) * kitchenMultiplier,

  };

  return staffPerformance.map(
    member => {

      let departmentPool =
        0;

      if (
        member.department ===
        "FOH"
      ) {

        departmentPool =
          departmentPools.FOH;

      }

      if (
        member.department ===
        "BAR"
      ) {

        departmentPool =
          departmentPools.BAR;

      }

      if (
        member.department ===
        "KITCHEN"
      ) {

        departmentPool =
          departmentPools.KITCHEN;

      }

      const multiplier =
        policy?.performance_enabled

          ? Number(
              member.multiplier || 1
            )

          : 1;

      const payout =
        (
          departmentPool /

          Math.max(
            1,

            staffPerformance.filter(
              s =>

                s.department ===
                member.department
            ).length
          )
        ) *

        multiplier;

      return {

        ...member,

        departmentLevel:
          member.department === "KITCHEN"
            ? kitchenLevel
            : "NORMAL",

        departmentMultiplier:
          member.department === "KITCHEN"
            ? kitchenMultiplier
            : 1,

        payout:
          Number(
            payout.toFixed(2)
          ),

      };

    }
  );

}
