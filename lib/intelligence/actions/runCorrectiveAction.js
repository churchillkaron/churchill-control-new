import createAlert from "@/lib/alerts/createAlert";

import storeInsightMemory from "@/lib/intelligence/memory/storeInsightMemory";

export default async function runCorrectiveAction({
  tenant_id,
  issue,
  severity = "warning",
}) {

  try {

    let action =
      "Monitor system.";

    if (
      issue ===
      "LOW_REVENUE"
    ) {

      action =
        "Increase marketing campaigns and upselling.";
    }

    if (
      issue ===
      "LOW_PERFORMANCE"
    ) {

      action =
        "Review staff operations and kitchen workflow.";
    }

    if (
      issue ===
      "HIGH_WASTE"
    ) {

      action =
        "Review production controls and inventory handling.";
    }

    await createAlert({
      tenant_id,
      severity,
      message:
        action,
    });

    await storeInsightMemory({
      tenant_id,
      category:
        "corrective_action",
      payload: {
        issue,
        action,
        severity,
      },
    });

    return {
      success: true,
      issue,
      action,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
