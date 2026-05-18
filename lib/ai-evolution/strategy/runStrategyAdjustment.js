export default async function runStrategyAdjustment({
  optimization,
}) {

  try {

    const strategy = [];

    for (const item of optimization.optimizations || []) {

      if (
        item.type ===
        "AUTONOMOUS_MODE"
      ) {

        strategy.push({

          action:
            "ENABLE_ADVANCED_AUTONOMY",
        });
      }

      if (
        item.type ===
        "KITCHEN"
      ) {

        strategy.push({

          action:
            "REALLOCATE_SHIFT_CAPACITY",
        });
      }
    }

    return {

      success: true,

      strategy,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
