import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TENDER_DEFINITIONS = Object.freeze([
  { uiMethod: "CASH", configMethod: null, eventType: "POS_CASH_PAYMENT_RECEIVED" },
  { uiMethod: "CARD", configMethod: "credit_card", eventType: "POS_CARD_PAYMENT_RECEIVED" },
  { uiMethod: "QR", configMethod: "qr_payment", eventType: "POS_QR_PAYMENT_RECEIVED" },
  { uiMethod: "TRANSFER", configMethod: "bank_transfer", eventType: "POS_TRANSFER_PAYMENT_RECEIVED" },
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function financeEventTypeForPaymentMethod(paymentMethod) {
  const normalized = String(paymentMethod || "").trim().toUpperCase();
  return TENDER_DEFINITIONS.find((definition) => definition.uiMethod === normalized)?.eventType || null;
}

export async function resolveRestaurantSettlementConfig({ organizationId, entityId, applicationId = "restaurant" }) {
  if (!organizationId) {
    const error = new Error("organizationId required");
    error.status = 400;
    throw error;
  }
  if (!entityId) {
    const error = new Error("Select an active legal entity before checkout");
    error.status = 400;
    throw error;
  }

  const normalizedApplicationId = String(applicationId || "restaurant").trim().toLowerCase() || "restaurant";
  const [entityResult, shiftResult, paymentConfigResult, mappingsResult] = await Promise.all([
    supabaseAdmin.from("legal_entities").select("id, organization_id, currency, is_active").eq("id", entityId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle(),
    supabaseAdmin.from("pos_shifts").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).eq("application_id", normalizedApplicationId).in("status", ["OPEN", "ACTIVE"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("organization_payment_config").select("payment_method, currency, enabled, configuration").eq("organization_id", organizationId).eq("enabled", true),
    supabaseAdmin.from("finance_posting_mappings").select("event_type, status").eq("organization_id", organizationId).eq("entity_id", entityId).eq("status", "ACTIVE").in("event_type", ["POS_SALE_RECOGNIZED", ...TENDER_DEFINITIONS.map((definition) => definition.eventType)]),
  ]);

  if (entityResult.error && entityResult.error.code !== "PGRST116") throw entityResult.error;
  if (!entityResult.data) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }
  if (shiftResult.error && shiftResult.error.code !== "PGRST116") throw shiftResult.error;
  if (paymentConfigResult.error) throw paymentConfigResult.error;
  if (mappingsResult.error) throw mappingsResult.error;

  const currencyCode = String(entityResult.data.currency || "").trim().toUpperCase();
  if (!currencyCode) {
    const error = new Error("Legal entity currency is not configured");
    error.status = 409;
    throw error;
  }

  const configuredMethods = new Set((paymentConfigResult.data || []).filter((row) => {
    const rowCurrency = String(row.currency || "").trim().toUpperCase();
    return !rowCurrency || rowCurrency === currencyCode;
  }).map((row) => normalize(row.payment_method)).filter(Boolean));
  const mappedEvents = new Set((mappingsResult.data || []).map((row) => String(row.event_type || "").trim().toUpperCase()));
  const salePostingReady = mappedEvents.has("POS_SALE_RECOGNIZED");
  const paymentMethods = salePostingReady ? TENDER_DEFINITIONS.filter((definition) => {
    if (!mappedEvents.has(definition.eventType)) return false;
    if (!definition.configMethod) return true;
    return configuredMethods.has(definition.configMethod);
  }).map((definition) => definition.uiMethod) : [];

  const activeSession = shiftResult.data || null;
  let blocker = null;
  if (!salePostingReady) blocker = "Finance posting is not configured for restaurant POS sales";
  else if (!paymentMethods.length) blocker = "No Finance-ready restaurant payment methods are configured";
  else if (!activeSession) blocker = "Open a POS cash session for the selected legal entity";

  return {
    application_id: normalizedApplicationId,
    entity_id: entityId,
    currency_code: currencyCode,
    payment_methods: paymentMethods,
    partial_allowed: true,
    item_selection_allowed: true,
    cash_session_required: true,
    cash_session_id: activeSession?.id || null,
    ready: !blocker,
    blocker,
  };
}

export default resolveRestaurantSettlementConfig;
