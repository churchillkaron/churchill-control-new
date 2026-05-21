import runOwnerAgent from "../runOwnerAgent";

import storeVectorMemory from "@/lib/intelligence/vector/storeVectorMemory";

export default async function runNightlyOwnerCycle({
  tenant_id,
}) {

  try {

    const result =
      await runOwnerAgent({
        tenant_id,
      });

    await storeVectorMemory({
      tenant_id,
      category:
        "nightly_owner_cycle",
      text:
        JSON.stringify(
          result.summary
        ),
    });

    return {
      success: true,
      completed_at:
        new Date().toISOString(),
      result,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
