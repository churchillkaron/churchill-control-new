export function calculateForecast(
  history = []
) {

  if (
    !history.length
  ) {

    return {

      forecastRevenue: 0,

      forecastGuests: 0,

      forecastLabor: 0,

      forecastFoodCost: 0,

    };

  }

  let revenue = 0;

  let guests = 0;

  let labor = 0;

  let foodCost = 0;

  history.forEach(
    day => {

      revenue +=
        Number(
          day.revenue || 0
        );

      guests +=
        Number(
          day.guests || 0
        );

      labor +=
        Number(
          day.labor_cost || 0
        );

      foodCost +=
        Number(
          day.food_cost || 0
        );

    }
  );

  const days =
    history.length;

  return {

    forecastRevenue:
      revenue / days,

    forecastGuests:
      guests / days,

    forecastLabor:
      labor / days,

    forecastFoodCost:
      foodCost / days,

  };

}
