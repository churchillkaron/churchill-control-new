const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function weatherLabel(code) {
  const value = Number(code);
  if (value === 0) return "clear sky";
  if ([1, 2].includes(value)) return "partly cloudy";
  if (value === 3) return "overcast";
  if ([45, 48].includes(value)) return "fog";
  if ([51, 53, 55, 56, 57].includes(value)) return "drizzle";
  if ([61, 63, 65, 66, 67].includes(value)) return "rain";
  if ([71, 73, 75, 77].includes(value)) return "snow";
  if ([80, 81, 82].includes(value)) return "rain showers";
  if ([85, 86].includes(value)) return "snow showers";
  if ([95, 96, 99].includes(value)) return "thunderstorms";
  return "mixed conditions";
}

async function jsonFetch(url, timeoutMs = 5000) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Avantiqo/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`WEATHER_PROVIDER_HTTP_${response.status}`);
  return response.json();
}

export async function readOperatorWeather({ payload = {} } = {}) {
  const location = text(payload.location, 240);
  if (!location) {
    return {
      status: "CLARIFICATION_REQUIRED",
      missing: ["location"],
      clarification_question: "Which location should I use?",
      authorization_effect: "NONE",
    };
  }

  const geocode = new URL(GEOCODING_URL);
  geocode.searchParams.set("name", location);
  geocode.searchParams.set("count", "1");
  geocode.searchParams.set("language", "en");
  geocode.searchParams.set("format", "json");
  const geocoded = await jsonFetch(geocode);
  const place = Array.isArray(geocoded?.results) ? geocoded.results[0] : null;
  if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
    return {
      status: "CLARIFICATION_REQUIRED",
      missing: ["location"],
      clarification_question: `I couldn't resolve “${location}” to a location. Which city or area should I use?`,
      authorization_effect: "NONE",
    };
  }

  const forecast = new URL(FORECAST_URL);
  forecast.searchParams.set("latitude", String(place.latitude));
  forecast.searchParams.set("longitude", String(place.longitude));
  forecast.searchParams.set("timezone", "auto");
  forecast.searchParams.set("forecast_days", "2");
  forecast.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,precipitation,rain,showers");
  forecast.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum");
  const data = await jsonFetch(forecast);
  const current = data?.current || {};
  const daily = data?.daily || {};

  return {
    status: "CURRENT_WEATHER",
    location: {
      name: text(place.name, 160),
      admin1: text(place.admin1, 160) || null,
      country: text(place.country, 160) || null,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      timezone: text(data?.timezone, 120) || null,
    },
    current: {
      observed_at: text(current.time, 80) || null,
      temperature_c: Number(current.temperature_2m),
      apparent_temperature_c: Number(current.apparent_temperature),
      weather_code: Number(current.weather_code),
      condition: weatherLabel(current.weather_code),
      precipitation_mm: Number(current.precipitation || 0),
      rain_mm: Number(current.rain || 0),
      showers_mm: Number(current.showers || 0),
    },
    today: {
      date: Array.isArray(daily.time) ? daily.time[0] : null,
      condition: weatherLabel(Array.isArray(daily.weather_code) ? daily.weather_code[0] : null),
      high_c: Array.isArray(daily.temperature_2m_max) ? Number(daily.temperature_2m_max[0]) : null,
      low_c: Array.isArray(daily.temperature_2m_min) ? Number(daily.temperature_2m_min[0]) : null,
      precipitation_probability_max: Array.isArray(daily.precipitation_probability_max) ? Number(daily.precipitation_probability_max[0]) : null,
      precipitation_sum_mm: Array.isArray(daily.precipitation_sum) ? Number(daily.precipitation_sum[0]) : null,
    },
    tomorrow: {
      date: Array.isArray(daily.time) ? daily.time[1] : null,
      condition: weatherLabel(Array.isArray(daily.weather_code) ? daily.weather_code[1] : null),
      high_c: Array.isArray(daily.temperature_2m_max) ? Number(daily.temperature_2m_max[1]) : null,
      low_c: Array.isArray(daily.temperature_2m_min) ? Number(daily.temperature_2m_min[1]) : null,
      precipitation_probability_max: Array.isArray(daily.precipitation_probability_max) ? Number(daily.precipitation_probability_max[1]) : null,
    },
    provider: "open-meteo",
    retrieved_at: new Date().toISOString(),
    authorization_effect: "NONE",
  };
}

export default readOperatorWeather;
