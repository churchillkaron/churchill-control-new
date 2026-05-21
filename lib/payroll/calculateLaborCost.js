export function calculateLaborCost(
  shifts = [],
  revenue = 0
) {

  let totalLaborCost = 0;

  let totalHours = 0;

  const breakdown =
    shifts.map(shift => {

      const hours =
        Number(
          shift.hours || 0
        );

      const hourlyRate =
        Number(
          shift.hourly_rate || 0
        );

      const laborCost =
        hours *
        hourlyRate;

      totalLaborCost +=
        laborCost;

      totalHours +=
        hours;

      return {

        staff_name:
          shift.staff_name,

        department:
          shift.department,

        hours,

        hourly_rate:
          hourlyRate,

        labor_cost:
          laborCost,

      };

    });

  const laborPercent =

    revenue > 0

      ? (
          totalLaborCost /
          revenue
        ) * 100

      : 0;

  const revenuePerHour =

    totalHours > 0

      ? revenue /
        totalHours

      : 0;

  return {

    totalLaborCost,

    totalHours,

    laborPercent,

    revenuePerHour,

    breakdown,

  };

}
