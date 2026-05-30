export default function buildStaffRuntime({
  staff = null,
  schedule = null,
  activeShift = null,
}) {
  return {
    staff: {
      id: staff?.id,
      name: staff?.name,
      role: staff?.role,
    },

    shiftStatus:
      activeShift
        ? "ON_SHIFT"
        : schedule
        ? "SCHEDULED"
        : "OFF",

    nextShift:
      schedule?.start_time || null,

    payrollStatus:
      "PENDING",

    scheduleAssigned:
      !!schedule,

    generatedAt:
      new Date().toISOString(),
  };
}
