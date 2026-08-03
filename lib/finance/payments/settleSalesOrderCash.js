import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value, field) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    const error = new Error(`${field} must be a UUID`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function text(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    const error = new Error(`${field} required`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function actorId(access = {}) {
  return uuid(
    access.access?.staffAccountId || access.staff?.id || access.user?.id,
    "authenticated actor"
  );
}

function entityCurrency(entity = {}) {
  return String(entity.currency || entity.currency_code || "")
    .trim()
    .toUpperCase();
}

async function loadOrder({ organizationId, entityId, salesOrderId }) {
  const result = await supabaseAdmin
    .from("sales_orders")
    .select("*")
    .eq("id", salesOrderId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Sales order not found in organization and entity scope");
    error.status = 404;
    throw error;
  }
  return result.data;
}

async function loadActiveCashSession({
  organizationId,
  entityId,
  applicationId,
  requestedSessionId,
}) {
  let query = supabaseAdmin
    .from("pos_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("application_id", applicationId)
    .in("status", ["OPEN", "ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (requestedSessionId) {
    query = query.eq("id", requestedSessionId);
  }

  const result = await query.maybeSingle();
  if (result.error && result.error.code !== "PGRST116") throw result.error;
  if (!result.data) {
    const error = new Error(
      "Open an entity-scoped retail cash session before accepting cash"
    );
    error.status = 409;
    throw error;
  }
  return result.data;
}

export async function settleSalesOrderCash({
  access,
  body = {},
  organizationId,
}) {
  const entityId = uuid(
    body.entityId || body.entity_id || body.legalEntityId || body.legal_entity_id,
    "entity_id"
  );
  const salesOrderId = uuid(
    body.salesOrderId ||
      body.sales_order_id ||
      body.orderId ||
      body.order_id ||
      body.context?.id,
    "sales_order_id"
  );
  const applicationId = text(
    body.applicationId || body.application_id || "retail",
    "application_id"
  ).toLowerCase();
  const paymentMethod = text(
    body.paymentMethod || body.payment_method,
    "payment_method"
  ).toUpperCase();

  if (paymentMethod !== "CASH") {
    const error = new Error(
      "This settlement contract accepts cash only; provider-authorized tenders require their own confirmation flow"
    );
    error.status = 409;
    throw error;
  }

  if (body.partial || body.is_partial || (body.itemIds || body.item_ids || []).length) {
    const error = new Error("Retail cash settlement currently requires the full order balance");
    error.status = 409;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }

  const order = await loadOrder({ organizationId, entityId, salesOrderId });
  const currencyCode = String(order.currency_code || "").trim().toUpperCase();
  const functionalCurrency = entityCurrency(entity);

  if (!currencyCode || !functionalCurrency) {
    const error = new Error("Configure both sales-order and legal-entity currency");
    error.status = 409;
    throw error;
  }

  if (currencyCode !== functionalCurrency) {
    const error = new Error(
      "A configured effective exchange-rate resolver is required for cross-currency POS settlement"
    );
    error.status = 409;
    throw error;
  }

  const requestedSessionId = body.cashSessionId || body.cash_session_id || null;
  const cashSession = await loadActiveCashSession({
    organizationId,
    entityId,
    applicationId,
    requestedSessionId,
  });
  const remainingBalance = Number(order.remaining_balance ?? order.total_amount ?? 0);
  const tenderedAmount = Number(
    body.tenderedAmount ?? body.tendered_amount ?? body.paidAmount ?? body.paid_amount
  );

  if (!Number.isFinite(remainingBalance) || remainingBalance <= 0) {
    const error = new Error("Sales order has no remaining balance");
    error.status = 409;
    throw error;
  }

  if (!Number.isFinite(tenderedAmount) || tenderedAmount < remainingBalance) {
    const error = new Error("Tendered cash must cover the full remaining balance");
    error.status = 400;
    throw error;
  }

  const paymentId = randomUUID();
  const postingDate = new Date().toISOString().slice(0, 10);
  const idempotencyKey = text(
    body.idempotencyKey || body.idempotency_key,
    "idempotency_key"
  );
  const journal = await prepareAccountingEventJournal({
    event: {
      organization_id: organizationId,
      entity_id: entityId,
      event_type: "PAYMENT_RECEIVED",
      source_module: "commercial",
      source_id: paymentId,
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        source_document: "sales_order_payment",
        source_document_id: paymentId,
        sales_order_id: salesOrderId,
        amount: remainingBalance,
        tax_amount: 0,
        currency_code: currencyCode,
        exchange_rate: 1,
        entry_date: postingDate,
        description: `Sales Order Payment ${order.order_number || salesOrderId}`,
      },
    },
  });

  const result = await supabaseAdmin.rpc(
    "finance_settle_sales_order_cash_idempotent",
    {
      p_payment_id: paymentId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_sales_order_id: salesOrderId,
      p_cash_session_id: cashSession.id,
      p_application_id: applicationId,
      p_tendered_amount: tenderedAmount,
      p_actor_id: actorId(access),
      p_currency_code: currencyCode,
      p_exchange_rate: 1,
      p_posting_date: journal.postingDate,
      p_journal_type: journal.journalType,
      p_journal_reference: journal.reference,
      p_journal_description: journal.description,
      p_journal_lines: journal.lines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    const unavailable =
      result.error.code === "PGRST202" ||
      /finance_settle_sales_order_cash_idempotent/i.test(result.error.message || "");
    if (unavailable) {
      const error = new Error("Retail cash-settlement migration is not deployed");
      error.status = 503;
      throw error;
    }
    throw result.error;
  }

  return {
    ...(result.data || {}),
    success: true,
    application_id: applicationId,
    entity_id: entityId,
    cash_session_id: cashSession.id,
  };
}

export default settleSalesOrderCash;
