export function calculateDepartmentPerformance(
  shifts = [],
  revenue = 0
) {

  const departments = {};

  shifts.forEach(
    shift => {

      const department =
        shift.department || "GENERAL";

      if (
        !departments[
          department
        ]
      ) {

        departments[
          department
        ] = {

          hours: 0,

          laborCost: 0,

          staffCount: 0,

        };

      }

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

      departments[
        department
      ].hours += hours;

      departments[
        department
      ].laborCost +=
        laborCost;

      departments[
        department
      ].staffCount += 1;

    }
  );

  return Object.entries(
    departments
  ).map(
    ([name, data]) => {

      const laborPercent =

        revenue > 0

          ? (
              data.laborCost /
              revenue
            ) * 100

          : 0;

      let health =
        "GOOD";

      if (
        laborPercent >= 40
      ) {

        health =
          "CRITICAL";

      } else if (
        laborPercent >= 30
      ) {

        health =
          "BAD";

      } else if (
        laborPercent >= 25
      ) {

        health =
          "WARNING";

      }

      return {

        department:
          name,

        hours:
          data.hours,

        laborCost:
          data.laborCost,

        staffCount:
          data.staffCount,

        laborPercent,

        health,

      };

    }
  );

}
