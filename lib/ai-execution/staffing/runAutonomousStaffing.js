export default async function runAutonomousStaffing({
  ai_operations,
}) {

  try {

    const staffing =
      ai_operations.operations
        ?.staffing;

    const actions = [];

    if (
      staffing
        ?.recommended_staff > 5
    ) {

      actions.push({

        action:
          "INCREASE_SHIFT_CAPACITY",

        recommended_staff:
          staffing.recommended_staff,
      });
    }

    return {

      success: true,

      actions,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
