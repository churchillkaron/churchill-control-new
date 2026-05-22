export default function calculateOvertimePay({

  payrollCountryPack = {},

  overtimeHours = 0,

  hourlyRate = 0,

  isWeekend = false,

  isHoliday = false,

  overtimeEligible = true,

}) {

  if (!overtimeEligible) {

    return 0;

  }

  const overtimeRules =
    payrollCountryPack?.overtime_rules || {};

  const standardMultiplier =
    Number(
      payrollCountryPack?.overtime_multiplier || 1.5
    );

  const weekendMultiplier =
    Number(
      overtimeRules?.weekend_multiplier || 2
    );

  const holidayMultiplier =
    Number(
      overtimeRules?.holiday_multiplier || 3
    );

  let multiplier =
    standardMultiplier;

  if (isWeekend) {

    multiplier =
      weekendMultiplier;

  }

  if (isHoliday) {

    multiplier =
      holidayMultiplier;

  }

  const overtimePay =
    Number(
      (
        Number(overtimeHours || 0) *
        Number(hourlyRate || 0) *
        multiplier
      ).toFixed(2)
    );

  return overtimePay;

}
