import loadTenantPayoutPolicy from "@/lib/payroll/policies/loadTenantPayoutPolicy";

export default async function calculateDailyPayouts({

  tenantId,

  serviceCharge = 0,

  staffPerformance = [],

}) {

  const policy =
    await loadTenantPayoutPolicy(
      tenantId
    );

  let kitchenLevel = "GOOD";

  if (
    policy?.payout_model === "DEPARTMENT" ||
    policy?.performance_enabled
  ) {

    try {

      const kitchenPerformance = await loadKitchenPerformance({
        tenantId,
      });

      kitchenLevel =
        kitchenPerformance?.kitchenLevel ||
        "GOOD";

    } catch (error) {

      console.warn(
        "FULFILLMENT_REPORT_UNAVAILABLE",
        error?.message
      );

      kitchenLevel = "GOOD";

    }

  }

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

    const eligibleStaff =
      staffPerformance.filter(
        member =>
          Number(member.totalHours || 0) > 0 ||
          Number(member.completedShifts || 0) > 0
      );

    const split =
      serviceCharge /
      Math.max(
        1,
        eligibleStaff.length
      );

    return staffPerformance.map(
      member => {

        const multiplier =
          policy?.performance_enabled

            ? Number(
                member.multiplier || 1
              )

            : 1;

        const eligible =
          Number(member.totalHours || 0) > 0 ||
          Number(member.completedShifts || 0) > 0;

        return {

          ...member,

          payout:
            eligible
              ? Number(
                  (
                    split *
                    multiplier
                  ).toFixed(2)
                )
              : 0,

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

    PRODUCTION:
      (serviceCharge * globalServiceMultiplier) *
      (
        Number(
          policy?.bar_percentage || 0
        ) / 100
      ),

    FULFILLMENT:
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
        "PRODUCTION"
      ) {

        departmentPool =
          departmentPools.PRODUCTION;

      }

      if (
        member.department ===
        "FULFILLMENT"
      ) {

        departmentPool =
          departmentPools.FULFILLMENT;

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
          member.department === "FULFILLMENT"
            ? kitchenLevel
            : "NORMAL",

        departmentMultiplier:
          member.department === "FULFILLMENT"
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
