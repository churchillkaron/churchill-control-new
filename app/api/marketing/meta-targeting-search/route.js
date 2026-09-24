export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import "@/lib/platform/service-runtime/providers/meta/ManagedMetaCredentialRegistration";

const GRAPH_VERSION = "v23.0";

function text(value) {
  return String(value ?? "").trim();
}

function tokenFromCredential(credential = {}) {
  return credential.access_token || credential.token || credential.api_token || null;
}

function adAccountId(credential = {}) {
  const raw = text(credential.ad_account_id || credential.meta_ad_account_id || credential.account_id);
  if (!raw) return null;
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

async function graph(path, accessToken, params = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta targeting lookup failed (${response.status})`);
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return payload;
}

function safeResult(row = {}, type) {
  return {
    id: text(row.id || row.key),
    name: text(row.name || row.label || row.id || row.key),
    type: text(row.type || type).toLowerCase(),
    country_code: text(row.country_code || row.country_code2).toUpperCase() || null,
    region: text(row.region) || null,
    supports_region: row.supports_region ?? null,
    supports_city: row.supports_city ?? null,
    subtype: text(row.subtype) || null,
    last_fired_time: text(row.last_fired_time) || null,
  };
}

export const GET = withApiHandler("marketing-meta-targeting-search", async (request) => {
  const url = new URL(request.url);
  const access = await requireOrganizationAccess({
    organizationId: url.searchParams.get("organizationId"),
    request,
    requiredPermission: "marketing.ads.manage",
  });
  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  const type = text(url.searchParams.get("type")).toLowerCase();
  const query = text(url.searchParams.get("q"));
  const credential = await resolveProviderCredential({
    organization_id: access.organizationId,
    provider: "meta",
  });
  const accessToken = tokenFromCredential(credential || {});
  if (!accessToken) {
    const error = new Error("Meta managed credential is not configured");
    error.status = 400;
    throw error;
  }

  let payload;
  if (type === "interest") {
    if (query.length < 2) return { type, results: [] };
    payload = await graph("search", accessToken, { type: "adinterest", q: query, limit: 25 });
  } else if (type === "behavior") {
    if (query.length < 2) return { type, results: [] };
    payload = await graph("search", accessToken, { type: "adTargetingCategory", class: "behaviors", q: query, limit: 50 });
    payload.data = (payload.data || []).filter((row) =>
      text(row.name).toLowerCase().includes(query.toLowerCase()) ||
      (Array.isArray(row.path) && row.path.some((item) => text(item).toLowerCase().includes(query.toLowerCase()))),
    );
  } else if (type === "location") {
    if (query.length < 2) return { type, results: [] };
    payload = await graph("search", accessToken, {
      type: "adgeolocation",
      q: query,
      location_types: JSON.stringify(["country", "region", "city", "zip"]),
      limit: 25,
    });
  } else if (type === "locale") {
    if (query.length < 2) return { type, results: [] };
    payload = await graph("search", accessToken, { type: "adlocale", q: query, limit: 25 });
  } else if (type === "custom_audience") {
    const account = adAccountId(credential || {});
    if (!account) {
      const error = new Error("Meta ad account is not configured");
      error.status = 400;
      throw error;
    }
    payload = await graph(`${account}/customaudiences`, accessToken, {
      fields: "id,name,subtype",
      limit: 100,
    });
    if (query) {
      payload.data = (payload.data || []).filter((row) => text(row.name).toLowerCase().includes(query.toLowerCase()));
    }
  } else if (type === "pixel") {
    const account = adAccountId(credential || {});
    if (!account) {
      const error = new Error("Meta ad account is not configured");
      error.status = 400;
      throw error;
    }
    payload = await graph(`${account}/adspixels`, accessToken, {
      fields: "id,name,last_fired_time",
      limit: 100,
    });
    if (query) {
      payload.data = (payload.data || []).filter((row) => text(row.name).toLowerCase().includes(query.toLowerCase()));
    }
  } else {
    const error = new Error("Unsupported Meta targeting lookup type");
    error.status = 400;
    throw error;
  }

  return {
    type,
    results: (payload?.data || []).map((row) => safeResult(row, type)).filter((row) => row.id),
  };
});
