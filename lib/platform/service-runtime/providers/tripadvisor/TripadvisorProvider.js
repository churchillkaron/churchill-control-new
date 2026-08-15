import "./TripadvisorCredentialRegistration.js";

const API_BASE = "https://terra.tripadvisor.com/api";

function text(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function locationId(input) {
  const id = text(
    input.location_id ||
      input.locationId ||
      input.external_id ||
      input.asset_external_id,
  );
  if (!/^\d+$/.test(id)) throw new Error("TRIPADVISOR_LOCATION_ID_REQUIRED");
  return id;
}

async function terraGet(path, apiKey, search = null) {
  if (!text(apiKey)) throw new Error("TRIPADVISOR_MANAGED_API_KEY_REQUIRED");

  const url = new URL(`${API_BASE}${path}`);
  if (search && typeof search === "object") {
    for (const [key, value] of Object.entries(search)) {
      if (value === null || value === undefined || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.detail ||
        payload?.title ||
        payload?.message ||
        `TRIPADVISOR_REQUEST_FAILED:${response.status}`,
    );
    error.status = response.status;
    error.trace_id = payload?.trace_id || null;
    throw error;
  }
  return payload;
}

async function searchLocations(input, apiKey) {
  const query = text(input.query || input.q || input.search);
  if (!query) throw new Error("TRIPADVISOR_LOCATION_SEARCH_QUERY_REQUIRED");

  return terraGet("/locations/search", apiKey, {
    query,
    search_type: text(input.search_type) || "NAME",
    country_code: text(input.country_code) || null,
    geo_name: text(input.geo_name) || null,
    postal_code: text(input.postal_code) || null,
    category: text(input.category) || null,
    locale: Array.isArray(input.locale) ? input.locale : null,
    page: Math.max(1, integer(input.page, 1)),
    size: Math.min(20, Math.max(1, integer(input.size, 10))),
  });
}

async function readLocation(input, apiKey) {
  const id = locationId(input);
  const locale = Array.isArray(input.locale) ? input.locale : null;
  return terraGet(`/locations/${encodeURIComponent(id)}`, apiKey, {
    locale,
  });
}

async function readReviews(input, apiKey) {
  const id = locationId(input);
  const sortBy = text(input.sort_by || input.sortBy || "MOST_RECENT").toUpperCase();
  if (!["MOST_RECENT", "HIGHEST_RATED"].includes(sortBy)) {
    throw new Error("TRIPADVISOR_REVIEW_SORT_INVALID");
  }

  return terraGet(`/locations/${encodeURIComponent(id)}/reviews`, apiKey, {
    rating_min: input.rating_min ?? null,
    trip_type: text(input.trip_type) || null,
    published_after_ts: text(input.published_after_ts) || null,
    sort_by: sortBy,
    published_after_review_id: text(input.published_after_review_id) || null,
    language: text(input.language) || "primary",
    page: Math.max(1, integer(input.page, 1)),
    size: Math.max(1, integer(input.size, 10)),
  });
}

export const TripadvisorProvider = {
  id: "tripadvisor",

  async execute(input = {}) {
    const credential = object(input.credential);
    const apiKey = text(input.api_key || credential.api_key);
    const capability = text(input.capability);

    let output;
    if (capability === "reputation.tripadvisor.locations.search") {
      output = await searchLocations(input, apiKey);
    } else if (capability === "reputation.tripadvisor.location.read") {
      output = await readLocation(input, apiKey);
    } else if (capability === "reputation.tripadvisor.reviews.read") {
      output = await readReviews(input, apiKey);
    } else {
      throw new Error(`Tripadvisor capability not supported: ${capability}`);
    }

    return {
      success: true,
      provider: "tripadvisor",
      output,
      persistence_contract: {
        provider_content_persisted_by_runtime: false,
        durable_mapping: "TRIPADVISOR_LOCATION_ID_ONLY",
      },
    };
  },
};
