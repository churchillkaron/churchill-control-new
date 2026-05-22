import getHolidayCalendar
from "./getHolidayCalendar";

export default function isPublicHoliday({

  country = "Thailand",

  date,

}) {

  if (!date) {
    return false;
  }

  const holidayCalendar =
    getHolidayCalendar(
      country
    );

  const normalizedDate =
    new Date(date)
      .toISOString()
      .slice(0, 10);

  return holidayCalendar.includes(
    normalizedDate
  );

}
