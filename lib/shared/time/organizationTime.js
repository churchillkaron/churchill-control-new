import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function validTimezone(value) {
  const timezone = cleanText(value);
  if (!timezone) return null;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

export function partsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function localDateString(date = new Date(), timezone = "UTC") {
  const parts = partsInTimezone(date, timezone);

  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function timezoneOffsetMs(date, timezone) {
  const parts = partsInTimezone(date, timezone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  const secondPrecision = Math.floor(date.getTime() / 1000) * 1000;
  return representedAsUtc - secondPrecision;
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(value || "").trim()
  );

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return {
    hour,
    minute,
    second,
    totalMinutes: hour * 60 + minute,
  };
}

function localDatePlusDays(dateValue, days) {
  const parsed = parseDate(dateValue);
  if (!parsed) return null;

  const date = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + days)
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function zonedDateTimeToUtc({
  date,
  time = "00:00:00",
  timezone = "UTC",
}) {
  const dateParts = parseDate(date);
  const timeParts = parseTime(time);

  if (!dateParts || !timeParts) return null;

  const guess = new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
      timeParts.second
    )
  );

  const firstOffset = timezoneOffsetMs(guess, timezone);
  let result = new Date(guess.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMs(result, timezone);

  if (secondOffset !== firstOffset) {
    result = new Date(guess.getTime() - secondOffset);
  }

  return result;
}

export function scheduleWindow({
  shiftDate,
  startTime,
  endTime,
  timezone = "UTC",
}) {
  const startParts = parseTime(startTime);
  const endParts = parseTime(endTime);

  if (!parseDate(shiftDate) || !startParts || !endParts) {
    return null;
  }

  const overnight = endParts.totalMinutes <= startParts.totalMinutes;
  const endDate = overnight
    ? localDatePlusDays(shiftDate, 1)
    : shiftDate;

  const start = zonedDateTimeToUtc({
    date: shiftDate,
    time: startTime,
    timezone,
  });

  const end = zonedDateTimeToUtc({
    date: endDate,
    time: endTime,
    timezone,
  });

  if (!start || !end || end <= start) return null;

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    overnight,
    durationMinutes: Math.round((end - start) / 60000),
  };
}

export function businessDayRange(timezone = "UTC", now = new Date()) {
  const businessDate = localDateString(now, timezone);
  const nextBusinessDate = localDatePlusDays(businessDate, 1);

  const start = zonedDateTimeToUtc({
    date: businessDate,
    time: "00:00:00",
    timezone,
  });

  const nextStart = zonedDateTimeToUtc({
    date: nextBusinessDate,
    time: "00:00:00",
    timezone,
  });

  return {
    businessDate,
    start: start.toISOString(),
    end: new Date(nextStart.getTime() - 1).toISOString(),
    nextStart: nextStart.toISOString(),
    timezone,
  };
}

async function safeQuery(query) {
  try {
    const result = await query;
    return {
      data: result.data || [],
      error: result.error || null,
    };
  } catch (error) {
    return {
      data: [],
      error,
    };
  }
}

export async function resolveOrganizationTimeContext({
  organizationId,
  entityId = null,
  locationId = null,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const [profileResult, entityResult, locationResult, restaurantResult] =
    await Promise.all([
      safeQuery(
        supabaseAdmin
          .from("finance_organization_profiles")
          .select(
            "entity_id,timezone,base_currency,functional_currency,updated_at"
          )
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("legal_entities")
          .select(
            "id,timezone,currency,is_active,is_default_accounting_entity"
          )
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("business_locations")
          .select("id,timezone,currency_code,status,is_default")
          .eq("organization_id", organizationId)
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("restaurant_settings")
          .select("timezone,currency")
          .eq("organization_id", organizationId)
          .limit(10)
      ),
    ]);

  const profiles = profileResult.data || [];
  const entities = entityResult.data || [];
  const locations = locationResult.data || [];
  const restaurantSettings = restaurantResult.data || [];

  const exactProfile = entityId
    ? profiles.find(
        (row) => row.entity_id === entityId && validTimezone(row.timezone)
      )
    : null;

  const organizationProfile =
    profiles.find(
      (row) => !row.entity_id && validTimezone(row.timezone)
    ) || profiles.find((row) => validTimezone(row.timezone));

  const exactEntity = entityId
    ? entities.find(
        (row) => row.id === entityId && validTimezone(row.timezone)
      )
    : null;

  const defaultEntity =
    entities.find(
      (row) =>
        row.is_default_accounting_entity === true &&
        validTimezone(row.timezone)
    ) || entities.find((row) => validTimezone(row.timezone));

  const exactLocation = locationId
    ? locations.find(
        (row) => row.id === locationId && validTimezone(row.timezone)
      )
    : null;

  const defaultLocation =
    locations.find(
      (row) => row.is_default === true && validTimezone(row.timezone)
    ) || locations.find((row) => validTimezone(row.timezone));

  const restaurantSetting = restaurantSettings.find((row) =>
    validTimezone(row.timezone)
  );

  const timezone =
    validTimezone(exactProfile?.timezone) ||
    validTimezone(exactEntity?.timezone) ||
    validTimezone(organizationProfile?.timezone) ||
    validTimezone(defaultEntity?.timezone) ||
    validTimezone(exactLocation?.timezone) ||
    validTimezone(defaultLocation?.timezone) ||
    validTimezone(restaurantSetting?.timezone) ||
    "UTC";

  const currency =
    exactProfile?.functional_currency ||
    exactProfile?.base_currency ||
    exactEntity?.currency ||
    organizationProfile?.functional_currency ||
    organizationProfile?.base_currency ||
    defaultEntity?.currency ||
    exactLocation?.currency_code ||
    defaultLocation?.currency_code ||
    restaurantSetting?.currency ||
    null;

  return {
    timezone,
    currency,
    sourceHealth: {
      financeProfile: !profileResult.error,
      legalEntities: !entityResult.error,
      businessLocations: !locationResult.error,
      restaurantSettings: !restaurantResult.error,
    },
  };
}

export default resolveOrganizationTimeContext;
