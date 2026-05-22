export default function getHolidayCalendar(
  country = "Thailand"
) {

  const calendars = {

    Thailand: [

      "2026-01-01",
      "2026-04-06",
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-05-01",
      "2026-12-05",
      "2026-12-10",
      "2026-12-31",

    ],

    UAE: [

      "2026-01-01",
      "2026-12-02",
      "2026-12-03",

    ],

  };

  return (
    calendars[country] || []
  );

}
