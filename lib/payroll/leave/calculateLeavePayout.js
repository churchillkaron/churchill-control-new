export default function calculateLeavePayout({

  payrollCountryPack = {},

  unusedLeaveDays = 0,

  dailySalary = 0,

  leaveType = "ANNUAL",

}) {

  const leaveRules =
    payrollCountryPack?.leave_rules || {};

  let eligibleDays = 0;

  if (
    leaveType === "ANNUAL"
  ) {

    eligibleDays =
      Number(
        leaveRules?.annual_leave_days || 0
      );

  }

  if (
    leaveType === "SICK"
  ) {

    eligibleDays =
      Number(
        leaveRules?.sick_leave_days || 0
      );

  }

  if (
    leaveType === "MATERNITY"
  ) {

    eligibleDays =
      Number(
        leaveRules?.maternity_leave_days || 0
      );

  }

  const payableDays =
    Math.min(
      Number(unusedLeaveDays || 0),
      eligibleDays
    );

  return Number(
    (
      payableDays *
      Number(dailySalary || 0)
    ).toFixed(2)
  );

}
