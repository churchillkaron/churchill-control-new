import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

const PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets";

function text(value) {
  return String(value ?? "").trim();
}

async function credentialFor(organizationId) {
  const credential = await resolveProviderCredential({
    organization_id: organizationId,
    provider: "alpaca",
  });

  if (!credential) throw new Error("ALPACA_TRADING_METADATA_CREDENTIAL_REQUIRED");

  const keyId = text(credential.api_key || credential.key_id || credential.key);
  const secret = text(credential.api_secret || credential.secret_key || credential.secret);
  if (!keyId || !secret) throw new Error("ALPACA_TRADING_METADATA_CREDENTIAL_INVALID");

  return { keyId, secret };
}

async function requestJson({ organizationId, path, searchParams = {} }) {
  const { keyId, secret } = await credentialFor(organizationId);
  const url = new URL(path, PAPER_TRADING_BASE_URL);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(
      "ALPACA_TRADING_METADATA_ERROR:" +
      response.status +
      ":" +
      (requestId || "no-request-id") +
      ":" +
      (payload?.message || "request failed"),
    );
  }

  return {
    payload,
    requestId: response.headers.get("x-request-id") || null,
    sourceUrl: url.toString(),
  };
}

export async function getUsEquityClock({ organizationId }) {
  const result = await requestJson({
    organizationId,
    path: "/v2/clock",
  });
  const clock = result.payload || {};

  return {
    timestamp: clock.timestamp || null,
    is_open: clock.is_open === true,
    next_open: clock.next_open || null,
    next_close: clock.next_close || null,
    provenance: {
      provider: "alpaca",
      endpoint: "trading_clock_v2",
      request_id: result.requestId,
      source_url: result.sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

export async function getTradingAsset({ organizationId, symbol }) {
  const ticker = text(symbol).toUpperCase();
  if (!ticker) throw new Error("symbol required");

  const result = await requestJson({
    organizationId,
    path: "/v2/assets/" + encodeURIComponent(ticker),
  });
  const asset = result.payload || {};
  const attributes = Array.isArray(asset.attributes) ? asset.attributes : [];

  return {
    id: asset.id || null,
    symbol: text(asset.symbol || ticker).toUpperCase(),
    name: asset.name || null,
    asset_class: asset.class || null,
    exchange: asset.exchange || null,
    status: text(asset.status).toLowerCase() || null,
    tradable: asset.tradable === true,
    fractionable: asset.fractionable === true,
    shortable: asset.shortable === true,
    borrow_status: asset.borrow_status || null,
    attributes,
    overnight_tradable: asset.overnight_tradable === true || attributes.includes("overnight_tradable"),
    overnight_halted: asset.overnight_halted === true || attributes.includes("overnight_halted"),
    fractional_extended_hours_enabled: attributes.includes("fractional_eh_enabled"),
    raw_payload: asset,
    provenance: {
      provider: "alpaca",
      endpoint: "trading_asset_v2",
      request_id: result.requestId,
      source_url: result.sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

export const AlpacaTradingMetadataProvider = {
  clock: getUsEquityClock,
  asset: getTradingAsset,
};
