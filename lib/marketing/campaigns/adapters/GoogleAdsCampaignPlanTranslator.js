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
  const explicit = number(
    channel?.provider_settings?.daily_budget ??
    plan?.budget?.daily_amount ??
    plan?.budget?.daily_budget
  );
  if (explicit !== null && explicit > 0) return explicit;

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
  return Number((total / durationDays).toFixed(2));
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

  const destinationUrl = text(plan?.creative?.destination_url);
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

  return {
    accountAssetId,
    campaignName,
    authorizedBudget,
    dailyBudget: dailyBudget({ plan, channel, start, end }),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    destinationUrl,
    headlines: headlines(plan?.creative || {}),
    descriptions: descriptions(plan?.creative || {}),
    keywords: keywords(plan?.audience || {}),
    adGroupName:
      text(channel?.provider_settings?.ad_group_name) ||
      `${campaignName} - Search`,
    loginCustomerId:
      text(channel?.provider_settings?.login_customer_id) || null,
  };
}

export default translateGoogleAdsCampaignPlan;
