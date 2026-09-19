const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

async function jsonFetch(url, timeoutMs = 5000) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Avantiqo/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`TIME_PROVIDER_HTTP_${response.status}`);
  return response.json();
}

function validTimezone(value) {
  const timezone = text(value, 120);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

export async function readOperatorTime({ payload = {}, now = new Date() } = {}) {
  const location = text(payload.location, 240);
  const suppliedTimezone = validTimezone(payload.timezone);
  if (!location && !suppliedTimezone) {
    return {
      status: "CLARIFICATION_REQUIRED",
      missing: ["location"],
      clarification_question: "Which location should I use?",
      authorization_effect: "NONE",
    };
  }

  let place = null;
  let timezone = suppliedTimezone;
  if (!timezone) {
    const geocode = new URL(GEOCODING_URL);
    geocode.searchParams.set("name", location);
    geocode.searchParams.set("count", "1");
    geocode.searchParams.set("language", "en");
    geocode.searchParams.set("format", "json");
    const geocoded = await jsonFetch(geocode);
    place = Array.isArray(geocoded?.results) ? geocoded.results[0] : null;
    timezone = validTimezone(place?.timezone);
    if (!place || !timezone) {
      return {
        status: "CLARIFICATION_REQUIRED",
        missing: ["location"],
        clarification_question: `I couldn't resolve “${location}” to a timezone. Which city or area should I use?`,
        authorization_effect: "NONE",
      };
    }
  }

  const locale = text(payload.locale, 80) || "en-US";
  const localTime = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  const localDate = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  return {
    status: "CURRENT_TIME",
    location: {
      name: text(place?.name, 160) || location || timezone,
      admin1: text(place?.admin1, 160) || null,
      country: text(place?.country, 160) || null,
      timezone,
    },
    local_time: localTime,
    local_date: localDate,
    observed_at: now.toISOString(),
    provider: place ? "open-meteo-geocoding+intl" : "intl",
    authorization_effect: "NONE",
  };
}

export default readOperatorTime;
