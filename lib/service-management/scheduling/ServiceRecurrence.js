function requireDate(value, name) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`Invalid ${name}.`);
    error.status = 400;
    throw error;
  }
  return date;
}

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonthsClamped(date, months, requestedDay = null) {
  const source = requireDate(date, "service occurrence date");
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const targetIndex = month + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const day = Math.min(
    requestedDay || source.getUTCDate(),
    daysInUtcMonth(targetYear, targetMonth),
  );

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    day,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ));
}

function alignWeekday(date, weekday) {
  if (weekday === null || weekday === undefined || Number.isNaN(Number(weekday))) {
    return date;
  }

  const desired = Math.max(0, Math.min(6, Number(weekday)));
  const delta = (desired - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date;
}

export function getNextServiceOccurrence(currentOccurrence, recurrence = {}) {
  const current = requireDate(currentOccurrence, "current service occurrence");
  const interval = Math.max(1, Number.parseInt(recurrence.interval, 10) || 1);
  const unit = String(recurrence.unit || "month").trim().toLowerCase();
  let next;

  if (unit === "day") {
    next = new Date(current.getTime());
    next.setUTCDate(next.getUTCDate() + interval);
  } else if (unit === "week") {
    next = new Date(current.getTime());
    next.setUTCDate(next.getUTCDate() + (interval * 7));
    next = alignWeekday(next, recurrence.weekday);
  } else if (unit === "year") {
    next = addUtcMonthsClamped(
      current,
      interval * 12,
      Number(recurrence.day_of_month) || current.getUTCDate(),
    );
  } else {
    next = addUtcMonthsClamped(
      current,
      interval,
      Number(recurrence.day_of_month) || current.getUTCDate(),
    );
  }

  return next.toISOString();
}

export function serviceOccurrenceWithinContract(occurrenceAt, contractEnd) {
  if (!contractEnd) return true;
  return requireDate(occurrenceAt, "service occurrence") <= requireDate(contractEnd, "contract end");
}

export function buildServiceGenerationKey(servicePlanId, occurrenceAt) {
  const planId = String(servicePlanId || "").trim();
  if (!planId) {
    const error = new Error("Service generation key requires service_plan_id.");
    error.status = 400;
    throw error;
  }

  return `service-plan:${planId}:occurrence:${requireDate(occurrenceAt, "service occurrence").toISOString()}`;
}

export function scheduledEndForOccurrence(occurrenceAt, durationMinutes = 60) {
  const start = requireDate(occurrenceAt, "service occurrence");
  const duration = Math.max(1, Number.parseInt(durationMinutes, 10) || 60);
  return new Date(start.getTime() + (duration * 60 * 1000)).toISOString();
}

export default getNextServiceOccurrence;
