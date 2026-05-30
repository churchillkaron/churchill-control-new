export default function generateLiveMission(
  context
) {

  // =====================================
  // VIP PUSH
  // =====================================

  if (
    context.vipTables > 0
  ) {

    return {

      type: "VIP",

      title:
        "VIP Experience Push",

      description:
        "High-value guests detected. Focus on luxury upselling and elite service.",

      reward:
        "+500 XP",

    };

  }

  // =====================================
  // KITCHEN RECOVERY
  // =====================================

  if (
    context.kitchenPressure ===
    "HIGH"
  ) {

    return {

      type: "RECOVERY",

      title:
        "Kitchen Recovery Mode",

      description:
        "Kitchen delays detected. Prioritize guest communication and recovery service.",

      reward:
        "+300 XP",

    };

  }

  // =====================================
  // SALES PUSH
  // =====================================

  return {

    type: "SALES",

    title:
      "Cocktail Upsell Push",

    description:
      "Increase premium cocktail conversions across active tables.",

    reward:
      "+250 XP",

  };

}
