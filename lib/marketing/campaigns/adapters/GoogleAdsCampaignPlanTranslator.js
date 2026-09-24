function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function executionError({
  code,
  message,
  correction = null,
  details = null,
}) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = "PLAN_TRANSLATION";
  error.code = code;
  error.provider = "google_ads";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  return error;
}

function localDateInTimezone(value, timezone) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return null;
  const zone = text(timezone || "UTC") || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    return null;
  }
}

function dates(plan = {}) {
  const start = new Date(plan.schedule?.start_time || Date.now());
  const end = new Date(plan.schedule?.end_time || "");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw executionError({
      code: "GOOGLE_ADS_FINITE_SCHEDULE_REQUIRED",
      message: "Google Search campaigns require valid start and end dates",
      correction: "Choose a finite campaign start and end date before approval.",
    });
  }
  if (end <= start) {
    throw executionError({
      code: "GOOGLE_ADS_SCHEDULE_INVALID",
      message: "Google Search campaign end date must be after its start date",
      correction: "Move the campaign end date after the start date.",
    });
  }

  return { start, end };
}

function dailyBudget({ plan, channel, start, end }) {
  const total = number(plan?.budget?.amount);
  if (total === null || total <= 0) {
    throw executionError({
      code: "GOOGLE_ADS_BUDGET_REQUIRED",
      message: "Google Search campaign requires a positive authorized budget",
      correction: "Set the total campaign budget before approval.",
    });
  }

  const durationDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
  );
  const explicit = number(
    channel?.provider_settings?.daily_budget ??
    plan?.budget?.daily_amount ??
    plan?.budget?.daily_budget
  );
  if (explicit !== null && explicit > 0) {
    if (explicit * durationDays > total + 0.000001) {
      throw executionError({
        code: "GOOGLE_ADS_DAILY_BUDGET_EXCEEDS_AUTHORIZATION",
        message: "Google Ads daily budget across the scheduled period exceeds the authorized provider budget",
        correction: "Lower the daily budget or increase the authorized Google Ads allocation before approval.",
        details: { daily_budget: explicit, duration_days: durationDays, authorized_budget: total },
      });
    }
    return explicit;
  }

  return Number((total / durationDays).toFixed(2));
}

function trackedDestinationUrl(creative = {}) {
  const raw = text(creative.destination_url);
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw executionError({
      code: "GOOGLE_ADS_DESTINATION_INVALID",
      message: "Google Ads destination URL is not valid",
      correction: "Use a complete HTTP or HTTPS landing-page URL.",
    });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw executionError({
      code: "GOOGLE_ADS_DESTINATION_INVALID",
      message: "Google Ads destination URL must use HTTP or HTTPS",
      correction: "Use a public HTTP or HTTPS landing-page URL.",
    });
  }
  const params = creative.utm_parameters && typeof creative.utm_parameters === "object" ? creative.utm_parameters : {};
  const mapping = { source: "utm_source", medium: "utm_medium", campaign: "utm_campaign", term: "utm_term", content: "utm_content" };
  for (const [key, queryKey] of Object.entries(mapping)) {
    const value = text(params[key]);
    if (value) url.searchParams.set(queryKey, value);
  }
  return url.toString();
}

function headlines(creative = {}) {
  const values = list(creative.headlines).map(text).filter(Boolean);
  if (text(creative.headline)) values.unshift(text(creative.headline));
  const unique = [...new Set(values)];

  if (unique.length < 3) {
    throw executionError({
      code: "GOOGLE_ADS_HEADLINES_REQUIRED",
      message: "Google Search requires at least three approved headlines",
      correction: "Add at least three Search-ad headlines before approval.",
    });
  }

  return unique.slice(0, 15);
}

function descriptions(creative = {}) {
  const values = list(creative.descriptions).map(text).filter(Boolean);
  if (text(creative.description)) values.unshift(text(creative.description));
  if (text(creative.primary_text)) values.push(text(creative.primary_text));
  const unique = [...new Set(values)];

  if (unique.length < 2) {
    throw executionError({
      code: "GOOGLE_ADS_DESCRIPTIONS_REQUIRED",
      message: "Google Search requires at least two approved descriptions",
      correction: "Add at least two Search-ad descriptions before approval.",
    });
  }

  return unique.slice(0, 4);
}

function negativeKeywords(audience = {}) {
  return list(audience.negative_keywords)
    .map((value) => {
      if (typeof value === "string") return { text: text(value), match_type: "PHRASE" };
      return {
        text: text(value?.text || value?.keyword || value?.name),
        match_type: text(value?.match_type || value?.matchType || "PHRASE").toUpperCase(),
      };
    })
    .filter((item) => item.text);
}

function googleLocationTargets(values = []) {
  return list(values)
    .map((item) => {
      const id = text(item?.id || item?.provider_id || item?.providerId || item);
      if (!id) return null;
      return {
        id,
        name: text(item?.name || item?.label) || null,
        resource_name: id.startsWith("geoTargetConstants/") ? id : `geoTargetConstants/${id}`,
      };
    })
    .filter(Boolean);
}

function googleLanguageTargets(values = []) {
  return list(values)
    .map((item) => {
      const id = text(item?.id || item?.provider_id || item?.providerId || item);
      if (!id) return null;
      return {
        id,
        name: text(item?.name || item?.label) || null,
        resource_name: id.startsWith("languageConstants/") ? id : `languageConstants/${id}`,
      };
    })
    .filter(Boolean);
}

function keywords(audience = {}) {
  const values = list(audience.keywords)
    .map((value) => {
      if (typeof value === "string") {
        return { text: text(value), match_type: "PHRASE" };
      }
      return {
        text: text(value?.text || value?.keyword || value?.name),
        match_type: text(value?.match_type || value?.matchType || "PHRASE").toUpperCase(),
      };
    })
    .filter((item) => item.text);

  if (!values.length) {
    throw executionError({
      code: "GOOGLE_ADS_KEYWORDS_REQUIRED",
      message: "Google Search campaign requires executable keywords",
      correction: "Add approved Search keywords to the campaign audience plan.",
    });
  }

  return values;
}

export function translateGoogleAdsCampaignPlan({ plan, channel }) {
  const accountAssetId = text(
    channel?.provider_settings?.account_asset_id ||
    channel?.account_asset_id
  );
  if (!accountAssetId) {
    throw executionError({
      code: "GOOGLE_ADS_ACCOUNT_MAPPING_REQUIRED",
      message: "Google Ads campaign requires a mapped Google Ads account",
      correction:
        "Choose the Google Ads account already mapped to the campaign entity in Administration → Integrations.",
    });
  }

  const destinationUrl = trackedDestinationUrl(plan?.creative || {});
  if (!destinationUrl) {
    throw executionError({
      code: "GOOGLE_ADS_DESTINATION_REQUIRED",
      message: "Google Search campaign requires a destination URL",
      correction: "Add the approved landing-page URL before campaign approval.",
    });
  }

  const authorizedBudget = number(plan?.budget?.amount);
  if (authorizedBudget === null || authorizedBudget <= 0) {
    throw executionError({
      code: "GOOGLE_ADS_BUDGET_REQUIRED",
      message: "Google Search campaign requires a positive authorized budget",
      correction: "Set the total campaign budget before approval.",
    });
  }

  const { start, end } = dates(plan);
  const campaignName = text(plan?.name) || "Avantiqo Google Search Campaign";

  const scheduleTimezone = text(plan?.schedule?.timezone || "UTC") || "UTC";
  const localStartDate = text(plan?.schedule?.local_start_date) || localDateInTimezone(plan?.schedule?.start_time, scheduleTimezone);
  const localEndDate = text(plan?.schedule?.local_end_date) || localDateInTimezone(plan?.schedule?.end_time, scheduleTimezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localStartDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(localEndDate || "")) {
    throw executionError({
      code: "GOOGLE_ADS_LOCAL_DATES_REQUIRED",
      message: "Google Search campaigns require resolvable organization-local start and end dates",
      correction: "Ensure the campaign schedule contains a valid timezone and finite start/end timestamps.",
    });
  }

  return {
    accountAssetId,
    campaignName,
    authorizedBudget,
    dailyBudget: dailyBudget({ plan, channel, start, end }),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    startDate: localStartDate,
    endDate: localEndDate,
    destinationUrl,
    headlines: headlines(plan?.creative || {}),
    descriptions: descriptions(plan?.creative || {}),
    keywords: keywords(plan?.audience || {}),
    negativeKeywords: negativeKeywords(plan?.audience || {}),
    includedLocations: googleLocationTargets(plan?.audience?.included_locations || []),
    excludedLocations: googleLocationTargets(plan?.audience?.excluded_locations || []),
    languageTargets: googleLanguageTargets(plan?.audience?.languages || []),
    adGroupName:
      text(channel?.provider_settings?.ad_group_name) ||
      `${campaignName} - Search`,
    searchPartners: channel?.provider_settings?.search_partners === true,
    loginCustomerId:
      text(channel?.provider_settings?.login_customer_id) || null,
  };
}

export default translateGoogleAdsCampaignPlan;
