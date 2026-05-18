export default async function runKernelSecurity({
  state,
}) {

  try {

    const violations = [];

    if (
      state.pending_jobs > 100
    ) {

      violations.push({

        severity:
          "HIGH",

        issue:
          "QUEUE_OVERLOAD",
      });
    }

    if (
      state.pending_approvals > 20
    ) {

      violations.push({

        severity:
          "HIGH",

        issue:
          "APPROVAL_BACKLOG",
      });
    }

    return {

      success: true,

      violations,

      secure:
        violations.length === 0,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
