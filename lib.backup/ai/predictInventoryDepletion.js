export function predictInventoryDepletion(
  inventoryItems = [],
  usageHistory = []
) {

  return inventoryItems.map(
    item => {

      const ingredientUsage =
        usageHistory.filter(
          usage =>

            usage.ingredient_id ===
            item.id
        );

      let totalUsage = 0;

      ingredientUsage.forEach(
        usage => {

          totalUsage +=
            Number(
              usage.quantity || 0
            );

        }
      );

      const avgDailyUsage =

        ingredientUsage.length > 0

          ? totalUsage /
            ingredientUsage.length

          : 0;

      const currentStock =
        Number(
          item.quantity || 0
        );

      const estimatedDaysLeft =

        avgDailyUsage > 0

          ? currentStock /
            avgDailyUsage

          : 999;

      let risk =
        "GOOD";

      if (
        estimatedDaysLeft <= 2
      ) {

        risk =
          "CRITICAL";

      } else if (
        estimatedDaysLeft <= 5
      ) {

        risk =
          "WARNING";

      }

      return {

        ingredient_id:
          item.id,

        ingredient_name:
          item.name,

        current_stock:
          currentStock,

        avg_daily_usage:
          avgDailyUsage,

        estimated_days_left:
          estimatedDaysLeft,

        risk,

      };

    }
  );

}
