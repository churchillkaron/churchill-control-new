export default function calculateSeverancePay({

  payrollCountryPack = {},

  yearsOfService = 0,

  monthlySalary = 0,

}) {

  const severanceRules =
    payrollCountryPack?.severance_rules || {};

  if (
    !severanceRules?.enabled
  ) {

    return 0;

  }

  let multiplier = 0;

  if (
    yearsOfService >= 1
  ) {

    multiplier = 1;

  }

  if (
    yearsOfService >= 3
  ) {

    multiplier = 3;

  }

  if (
    yearsOfService >= 5
  ) {

    multiplier = 6;

  }

  if (
    yearsOfService >= 10
  ) {

    multiplier = 10;

  }

  return Number(
    (
      Number(monthlySalary || 0) *
      multiplier
    ).toFixed(2)
  );

}
