export default function getPayrollPeriod({

  frequency = "MONTHLY",

  referenceDate =
    new Date(),

}) {

  const date =
    new Date(referenceDate);

  if (
    frequency === "WEEKLY"
  ) {

    const start =
      new Date(date);

    start.setDate(
      date.getDate() -
      date.getDay()
    );

    const end =
      new Date(start);

    end.setDate(
      start.getDate() + 6
    );

    return {

      frequency,

      startDate:
        start
          .toISOString()
          .slice(0, 10),

      endDate:
        end
          .toISOString()
          .slice(0, 10),

    };

  }

  const start =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      1
    );

  const end =
    new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0
    );

  return {

    frequency,

    startDate:
      start
        .toISOString()
        .slice(0, 10),

    endDate:
      end
        .toISOString()
        .slice(0, 10),

  };

}
