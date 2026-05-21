import predictStaffingNeeds from "@/lib/ai-operations/staffing/predictStaffingNeeds";

export default async function runHRAgent({
  tenant_id,
}) {

  try {

    const staffing =
      await predictStaffingNeeds({
        tenant_id,
      });

    const decisions = [];

    if (
      staffing.recommended_staff > 5
    ) {

      decisions.push({

        action:
          "INCREASE_STAFFING",

        recommended:
          staffing.recommended_staff,
      });
    }

    return {

      success: true,

      agent:
        "HR",

      staffing,

      decisions,
    };

  } catch (error) {

    return {

      success: false,

      agent:
        "HR",

      error:
        error.message,
    };
  }
}
