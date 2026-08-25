import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { WalletRuntime } from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

const PROVIDER = "telnyx";
const TELNYX_BASE_URL = "https://api.telnyx.com/v2";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function upper(value) {
  return text(value, 100).toUpperCase();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Number(finite(value).toFixed(6));
}

function providerConfig({ requireConnection = false } = {}) {
  const apiKey = text(process.env.TELNYX_API_KEY, 12000);
  const connectionId = text(process.env.AVANTIQO_SECRETARY_TELNYX_CONNECTION_ID, 200) || null;
  const markupRaw = text(process.env.AVANTIQO_SECRETARY_TELEPHONY_MARKUP_PERCENT, 40);
  const markupPercent = markupRaw ? Number(markupRaw) : null;
  const missing = [];
  if (!apiKey) missing.push("TELNYX_API_KEY");
  if (requireConnection && !connectionId) missing.push("AVANTIQO_SECRETARY_TELNYX_CONNECTION_ID");
  if (markupPercent !== null && (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000)) {
    throw new Error("SECRETARY_TELEPHONY_MARKUP_INVALID");
  }
  if (missing.length) throw new Error(`SECRETARY_MANAGED_TELEPHONY_CONFIG_MISSING:${missing.join(",")}`);
  return { apiKey, connectionId, markupPercent };
}

async function telnyx(path, { method = "GET", query = null, body = null } = {}) {
  const { apiKey } = providerConfig();
  const url = new URL(`${TELNYX_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Array.isArray(parsed?.errors) ? parsed.errors[0] : null;
    const code = text(firstError?.code || parsed?.code, 120) || `HTTP_${response.status}`;
    const detail = text(firstError?.detail || firstError?.title || parsed?.message, 500) || "provider rejected request";
    throw new Error(`SECRETARY_TELEPHONY_PROVIDER_ERROR:${code}:${detail}`);
  }
  return parsed?.data ?? parsed;
}

function priced(costInformation = {}) {
  const supplierCurrency = upper(costInformation.currency) || "USD";
  const supplierUpfront = money(costInformation.upfront_cost);
  const supplierMonthly = money(costInformation.monthly_cost);
  const { markupPercent } = providerConfig();
  const customerUpfront = markupPercent === null ? null : money(supplierUpfront * (1 + markupPercent / 100));
  const customerMonthly = markupPercent === null ? null : money(supplierMonthly * (1 + markupPercent / 100));
  return {
    supplier_currency: supplierCurrency,
    supplier_upfront: supplierUpfront,
    supplier_monthly: supplierMonthly,
    platform_markup_percent: markupPercent,
    customer_currency: supplierCurrency,
    customer_upfront: customerUpfront,
    customer_monthly: customerMonthly,
    initial_customer_reservation:
      customerUpfront === null || customerMonthly === null ? null : money(customerUpfront + customerMonthly),
    pricing_ready: markupPercent !== null,
  };
}

function publicNumber(row = {}) {
  return {
    phone_number: text(row.phone_number, 160),
    vanity_format: text(row.vanity_format, 160) || null,
    quickship: row.quickship === true,
    reservable: row.reservable === true,
    best_effort: row.best_effort === true,
    features: (Array.isArray(row.features) ? row.features : []).map((feature) => text(feature?.name, 80)).filter(Boolean),
    regions: Array.isArray(row.region_information) ? row.region_information : [],
    pricing: priced(object(row.cost_information)),
    managed_by_avantiqo: true,
    carrier_credentials_required_from_customer: false,
  };
}

export async function searchManagedSecretaryNumbers({
  countryCode,
  locality = null,
  numberType = "local",
  limit = 12,
  phoneNumber = null,
} = {}) {
  const country = upper(countryCode);
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("SECRETARY_TELEPHONY_COUNTRY_CODE_REQUIRED");
  const data = await telnyx("/available_phone_numbers", {
    query: {
      "filter[country_code]": country,
      "filter[phone_number_type]": text(numberType, 80) || "local",
      "filter[locality]": text(locality, 160) || null,
      "filter[phone_number]": text(phoneNumber, 160) || null,
      "filter[features]": "voice",
      "filter[limit]": Math.max(1, Math.min(50, Number(limit) || 12)),
      "filter[best_effort]": "false",
    },
  });
  const numbers = (Array.isArray(data) ? data : []).map(publicNumber).filter((row) => row.phone_number);
  return {
    provider_mode: "AVANTIQO_MANAGED",
    country_code: country,
    count: numbers.length,
    numbers,
    carrier_credentials_required_from_customer: false,
    external_secretary_authority_used: false,
  };
}

async function connectionById(organizationId, id) {
  const result = await supabaseAdmin
    .from("secretary_telephony_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_TELEPHONY_CONNECTION_NOT_FOUND");
  return result.data;
}

export async function listManagedSecretaryTelephony({ organizationId } = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  const result = await supabaseAdmin
    .from("secretary_telephony_connections")
    .select("id,phone_line_id,mode,provider_id,country_code,number_type,requested_locality,requested_number,phone_number,status,capabilities,pricing_snapshot,regulatory_state,last_error,active,created_at,updated_at")
    .eq("organization_id", organization)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return { status: "completed", connections: result.data || [], external_secretary_authority_used: false };
}

function classifyOrder(order = {}) {
  const status = text(order.status, 80).toLowerCase();
  const phone = Array.isArray(order.phone_numbers) ? order.phone_numbers[0] || {} : {};
  const phoneStatus = text(phone.status, 80).toLowerCase();
  const requirementsMet = order.requirements_met !== false && phone.requirements_met !== false;
  if (!requirementsMet) return "REQUIREMENTS_PENDING";
  if (status === "success" && (!phoneStatus || phoneStatus === "success")) return "ACTIVE";
  if (status === "failed") return "FAILED";
  if (status === "partial_success" && phoneStatus && phoneStatus !== "success") return "FAILED";
  return "PROVISIONING";
}

async function materializePhoneLine(connection, order) {
  const ordered = Array.isArray(order?.phone_numbers) ? order.phone_numbers[0] || {} : {};
  const phoneNumber = text(ordered.phone_number || connection.requested_number, 160);
  if (!phoneNumber) throw new Error("SECRETARY_TELEPHONY_ORDER_PHONE_NUMBER_MISSING");

  const metadata = {
    managed_telephony: true,
    telephony_connection_id: connection.id,
    provider_id: PROVIDER,
    provider_connection_id: connection.provider_connection_id,
    provider_phone_number_id: text(ordered.id, 200) || connection.provider_phone_number_id || null,
    provider_number_order_id: connection.provider_number_order_id,
    external_authority_used: false,
  };
  const lineResult = await supabaseAdmin
    .from("secretary_phone_lines")
    .upsert(
      {
        organization_id: connection.organization_id,
        line_address: phoneNumber,
        transport_kind: "PSTN",
        display_name: text(connection.metadata?.display_name, 200) || "Avantiqo Secretary",
        default_language: text(connection.metadata?.default_language, 80) || null,
        timezone: text(connection.metadata?.timezone, 120) || "UTC",
        inbound_enabled: true,
        outbound_enabled: true,
        metadata,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,line_address" },
    )
    .select("id,organization_id,line_address,transport_kind,display_name,default_language,timezone,inbound_enabled,outbound_enabled,active")
    .single();
  if (lineResult.error) throw lineResult.error;
  return lineResult.data;
}

async function settleWallet(connection, status) {
  const pricing = object(connection.pricing_snapshot);
  const amount = finite(pricing.initial_customer_reservation, 0);
  const currency = upper(pricing.customer_currency);
  if (amount <= 0 || !currency) return null;
  const reference = `secretary-telephony:${connection.id}:initial`;
  if (status === "ACTIVE") {
    return WalletRuntime.charge({
      organization_id: connection.organization_id,
      amount,
      currency,
      provider: PROVIDER,
      reference,
      idempotency_key: reference,
      metadata: { telephony_connection_id: connection.id, lifecycle: "INITIAL_ACTIVATION" },
    });
  }
  if (status === "FAILED") {
    return WalletRuntime.release({
      organization_id: connection.organization_id,
      amount,
      currency,
      provider: PROVIDER,
      reference,
      idempotency_key: reference,
      metadata: { telephony_connection_id: connection.id, lifecycle: "INITIAL_ACTIVATION_FAILED" },
    });
  }
  return null;
}

async function applyOrderState(connection, order) {
  const status = classifyOrder(order);
  const ordered = Array.isArray(order?.phone_numbers) ? order.phone_numbers[0] || {} : {};
  let phoneLine = null;
  if (status === "ACTIVE") phoneLine = await materializePhoneLine(connection, order);

  const update = {
    status,
    provider_phone_number_id: text(ordered.id, 200) || connection.provider_phone_number_id || null,
    phone_number: text(ordered.phone_number || connection.requested_number, 160) || connection.phone_number || null,
    requirement_group_id: text(ordered.requirement_group_id, 200) || connection.requirement_group_id || null,
    provider_sub_number_order_id:
      (Array.isArray(order?.sub_number_orders_ids) && text(order.sub_number_orders_ids[0], 200)) ||
      connection.provider_sub_number_order_id ||
      null,
    phone_line_id: phoneLine?.id || connection.phone_line_id || null,
    regulatory_state: {
      requirements_met: order?.requirements_met !== false && ordered?.requirements_met !== false,
      phone_status: text(ordered?.status, 80) || null,
      regulatory_requirements: Array.isArray(ordered?.regulatory_requirements) ? ordered.regulatory_requirements : [],
    },
    last_error: status === "FAILED" ? `TELNYX_NUMBER_ORDER_${upper(order?.status) || "FAILED"}` : null,
    updated_at: new Date().toISOString(),
  };
  const result = await supabaseAdmin
    .from("secretary_telephony_connections")
    .update(update)
    .eq("organization_id", connection.organization_id)
    .eq("id", connection.id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  await settleWallet(result.data, status);
  return { connection: result.data, phone_line: phoneLine };
}

export async function requestManagedSecretaryNumber({
  organizationId,
  countryCode,
  phoneNumber,
  numberType = "local",
  locality = null,
  idempotencyKey,
  displayName = null,
  defaultLanguage = null,
  timezone = "UTC",
} = {}) {
  const organization = text(organizationId, 120);
  const country = upper(countryCode);
  const requestedNumber = text(phoneNumber, 160);
  const replayKey = text(idempotencyKey, 240);
  if (!organization) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("SECRETARY_TELEPHONY_COUNTRY_CODE_REQUIRED");
  if (!requestedNumber) throw new Error("SECRETARY_TELEPHONY_PHONE_NUMBER_REQUIRED");
  if (!replayKey) throw new Error("SECRETARY_TELEPHONY_IDEMPOTENCY_KEY_REQUIRED");

  const existing = await supabaseAdmin
    .from("secretary_telephony_connections")
    .select("*")
    .eq("organization_id", organization)
    .eq("idempotency_key", replayKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { status: "reused", connection: existing.data, external_secretary_authority_used: false };

  const { connectionId, markupPercent } = providerConfig({ requireConnection: true });
  if (markupPercent === null) throw new Error("SECRETARY_TELEPHONY_PRICING_NOT_CONFIGURED");

  const search = await searchManagedSecretaryNumbers({
    countryCode: country,
    numberType,
    locality,
    phoneNumber: requestedNumber,
    limit: 10,
  });
  const selected = search.numbers.find((row) => row.phone_number === requestedNumber);
  if (!selected) throw new Error("SECRETARY_TELEPHONY_NUMBER_NO_LONGER_AVAILABLE");
  const pricing = selected.pricing;
  const reservationAmount = finite(pricing.initial_customer_reservation, 0);
  if (reservationAmount <= 0) throw new Error("SECRETARY_TELEPHONY_INITIAL_PRICE_REQUIRED");

  const inserted = await supabaseAdmin
    .from("secretary_telephony_connections")
    .insert({
      organization_id: organization,
      mode: "AVANTIQO_MANAGED",
      provider_id: PROVIDER,
      provider_connection_id: connectionId,
      country_code: country,
      number_type: text(numberType, 80) || "local",
      requested_locality: text(locality, 160) || null,
      requested_number: requestedNumber,
      status: "ORDERING",
      idempotency_key: replayKey,
      capabilities: { voice: true, inbound: true, outbound: true },
      pricing_snapshot: pricing,
      metadata: {
        display_name: text(displayName, 200) || null,
        default_language: text(defaultLanguage, 80) || null,
        timezone: text(timezone, 120) || "UTC",
        carrier_credentials_required_from_customer: false,
        secretary_authority: "AVANTIQO",
        external_authority_used: false,
      },
    })
    .select("*")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const replay = await supabaseAdmin
        .from("secretary_telephony_connections")
        .select("*")
        .eq("organization_id", organization)
        .eq("idempotency_key", replayKey)
        .single();
      if (replay.error) throw replay.error;
      return { status: "reused", connection: replay.data, external_secretary_authority_used: false };
    }
    throw inserted.error;
  }
  const connection = inserted.data;
  const walletReference = `secretary-telephony:${connection.id}:initial`;

  try {
    await WalletRuntime.prepaid({
      organization_id: organization,
      currency: pricing.customer_currency,
      require_positive_balance: true,
    });
    await WalletRuntime.reserve({
      organization_id: organization,
      amount: reservationAmount,
      currency: pricing.customer_currency,
      provider: PROVIDER,
      reference: walletReference,
      idempotency_key: walletReference,
      metadata: {
        telephony_connection_id: connection.id,
        supplier_upfront: pricing.supplier_upfront,
        supplier_monthly: pricing.supplier_monthly,
        platform_markup_percent: pricing.platform_markup_percent,
      },
    });

    const order = await telnyx("/number_orders", {
      method: "POST",
      body: {
        phone_numbers: [{ phone_number: requestedNumber }],
        connection_id: connectionId,
        customer_reference: `avantiqo:${organization}:${connection.id}`,
      },
    });
    const orderId = text(order?.id, 200);
    if (!orderId) throw new Error("SECRETARY_TELEPHONY_PROVIDER_ORDER_ID_MISSING");

    const stored = await supabaseAdmin
      .from("secretary_telephony_connections")
      .update({
        provider_number_order_id: orderId,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("id", connection.id)
      .select("*")
      .single();
    if (stored.error) throw stored.error;

    const applied = await applyOrderState(stored.data, order);
    return {
      status: applied.connection.status,
      connection: applied.connection,
      phone_line: applied.phone_line,
      carrier_credentials_required_from_customer: false,
      external_secretary_authority_used: false,
    };
  } catch (error) {
    await WalletRuntime.release({
      organization_id: organization,
      amount: reservationAmount,
      currency: pricing.customer_currency,
      provider: PROVIDER,
      reference: walletReference,
      idempotency_key: `${walletReference}:failed`,
      metadata: { telephony_connection_id: connection.id, reason: "PROVISIONING_EXCEPTION" },
    }).catch(() => null);
    await supabaseAdmin
      .from("secretary_telephony_connections")
      .update({ status: "FAILED", last_error: text(error?.message || error, 1000), updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("id", connection.id);
    throw error;
  }
}

export async function syncManagedSecretaryNumber({ organizationId, connectionId } = {}) {
  const organization = text(organizationId, 120);
  const id = text(connectionId, 120);
  if (!organization || !id) throw new Error("SECRETARY_TELEPHONY_CONNECTION_REQUIRED");
  const connection = await connectionById(organization, id);
  if (!connection.provider_number_order_id) return { status: connection.status, connection };
  const order = await telnyx(`/number_orders/${encodeURIComponent(connection.provider_number_order_id)}`);
  const applied = await applyOrderState(connection, order);
  return {
    status: applied.connection.status,
    connection: applied.connection,
    phone_line: applied.phone_line,
    external_secretary_authority_used: false,
  };
}

export const SecretaryManagedTelephonyRuntime = Object.freeze({
  searchAvailableNumbers: searchManagedSecretaryNumbers,
  list: listManagedSecretaryTelephony,
  requestNumber: requestManagedSecretaryNumber,
  sync: syncManagedSecretaryNumber,
});

export default SecretaryManagedTelephonyRuntime;
