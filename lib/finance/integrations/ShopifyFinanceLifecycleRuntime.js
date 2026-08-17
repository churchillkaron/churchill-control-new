import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import createCustomerInvoice from "@/lib/finance/accounts-receivable/documents/createCustomerInvoice";
import postCustomerPrepayment from "@/lib/finance/accounts-receivable/capabilities/postCustomerPrepayment";
import applyCustomerPrepayment from "@/lib/finance/accounts-receivable/capabilities/applyCustomerPrepayment";
import refundCustomerPrepayment from "@/lib/finance/accounts-receivable/capabilities/refundCustomerPrepayment";
import refundCustomerPrepaymentAgainstInvoice from "@/lib/finance/accounts-receivable/capabilities/refundCustomerPrepaymentAgainstInvoice";
import { getCustomerPrepaymentAccountingReadiness } from "@/lib/finance/accounts-receivable/runtime/customerPrepaymentAccounting";
import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";

const CAPABILITY = "commerce.shopify.order.lifecycle.read";
const POST_MODE = "POST_TO_FINANCE";
const SUCCESS = "SUCCESS";
const INFLOW_KINDS = new Set(["SALE", "CAPTURE"]);
const REFUND_KIND = "REFUND";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return number(object(object(value).shopMoney).amount);
}

function resourceId(value) {
  if (value?.legacyResourceId !== undefined && value?.legacyResourceId !== null) {
    return text(value.legacyResourceId);
  }
  const raw = text(value?.id ?? value);
  if (!raw) return null;
  return raw.includes("/") ? raw.split("/").filter(Boolean).pop() : raw;
}

function deterministicUuid(seed) {
  const hex = crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function orderIdFromEvent(event) {
  const payload = object(event?.payload);
  return text(payload.shopify_order_id || payload.provider_payload?.order_id || payload.provider_payload?.id) || null;
}

async function loadConnection(event) {
  const connectionId = text(event?.payload?.connection_id);
  if (!connectionId) throw new Error("SHOPIFY_CONNECTION_ID_REQUIRED");
  const result = await supabaseAdmin
    .from("organization_channel_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("organization_id", event.organization_id)
    .eq("provider", "shopify")
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SHOPIFY_ACTIVE_CONNECTION_REQUIRED");
  return result.data;
}

async function loadStore(event, connection) {
  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("*")
    .eq("organization_id", event.organization_id)
    .eq("connection_id", connection.id)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_store")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SHOPIFY_STORE_ASSET_REQUIRED");
  if (!result.data.entity_id) throw new Error("SHOPIFY_STORE_ENTITY_MAPPING_REQUIRED");
  return result.data;
}

async function readLifecycle(event, connection, orderId) {
  const wallet = await WalletRepository.getByOrganization(event.organization_id);
  const currency = text(wallet?.currency || wallet?.default_currency).toUpperCase();
  if (!currency) throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");

  const execution = await executeService({
    organization_id: event.organization_id,
    service_id: "online-store",
    provider_id: "shopify",
    capability: CAPABILITY,
    currency,
    input: {
      currency,
      quantity: 1,
      order_id: orderId,
    },
    metadata: {
      source: "SHOPIFY_FINANCE_LIFECYCLE",
      connection_id: connection.id,
      system_event_id: event.id,
      sensitive_output: true,
    },
  });

  const provider = object(object(execution?.output).output);
  const order = object(provider.order);
  if (!order.id) throw new Error("SHOPIFY_ORDER_LIFECYCLE_NOT_FOUND");
  return { order, usage_id: execution?.usage?.id || null };
}

async function saveAsset({ event, connection, store, type, externalId, name, metadata }) {
  if (!text(externalId)) return null;
  const existing = await ChannelAssetRuntime.find({
    organization_id: event.organization_id,
    provider: "shopify",
    asset_type: type,
    external_id: String(externalId),
  }).catch(() => null);

  return ChannelAssetRuntime.register({
    organization_id: event.organization_id,
    connection_id: connection.id,
    provider: "shopify",
    asset_type: type,
    external_id: String(externalId),
    name: text(name) || existing?.name || String(externalId),
    entity_id: store.entity_id,
    selected_by_party_id: existing?.selected_by_party_id || null,
    selected_at: existing?.selected_at || null,
    metadata: {
      ...object(existing?.metadata),
      ...metadata,
      source: "SHOPIFY",
      shopify_order_id: metadata.shopify_order_id || null,
      last_finance_lifecycle_event_id: event.id,
      last_finance_lifecycle_at: new Date().toISOString(),
    },
  });
}

function normalizeTransaction(transaction, orderId, refundId = null) {
  return {
    id: resourceId(transaction),
    kind: text(transaction.kind).toUpperCase(),
    status: text(transaction.status).toUpperCase(),
    test: transaction.test === true,
    gateway: text(transaction.gateway) || null,
    formatted_gateway: text(transaction.formattedGateway) || null,
    created_at: transaction.createdAt || null,
    processed_at: transaction.processedAt || null,
    amount: money(transaction.amountSet),
    currency: text(transaction?.amountSet?.shopMoney?.currencyCode).toUpperCase() || null,
    parent_transaction_id: resourceId(transaction.parentTransaction),
    shopify_order_id: orderId,
    shopify_refund_id: refundId,
  };
}

function normalizeRefund(refund, orderId) {
  const refundId = resourceId(refund);
  return {
    id: refundId,
    created_at: refund.createdAt || null,
    updated_at: refund.updatedAt || null,
    processed_at: refund.processedAt || null,
    note: text(refund.note) || null,
    total_refunded: money(refund.totalRefundedSet),
    currency: text(refund?.totalRefundedSet?.shopMoney?.currencyCode).toUpperCase() || null,
    shopify_order_id: orderId,
    transactions: array(refund?.transactions?.nodes).map((row) => normalizeTransaction(row, orderId, refundId)),
    line_items: array(refund?.refundLineItems?.nodes).map((row) => ({
      id: resourceId(row),
      quantity: number(row.quantity),
      restocked: row.restocked ?? null,
      restock_type: text(row.restockType) || null,
      subtotal: money(row.subtotalSet),
      tax: money(row.totalTaxSet),
      line_item_id: resourceId(row.lineItem),
      variant_id: resourceId(row?.lineItem?.variant),
      location_id: resourceId(row.location),
      location_name: row?.location?.name || null,
    })),
  };
}

function normalizeFulfillment(fulfillment, orderId) {
  return {
    id: resourceId(fulfillment),
    name: fulfillment.name || null,
    status: text(fulfillment.status).toUpperCase() || null,
    display_status: text(fulfillment.displayStatus).toUpperCase() || null,
    created_at: fulfillment.createdAt || null,
    updated_at: fulfillment.updatedAt || null,
    delivered_at: fulfillment.deliveredAt || null,
    total_quantity: number(fulfillment.totalQuantity),
    location_id: resourceId(fulfillment.location),
    location_name: fulfillment?.location?.name || null,
    tracking: array(fulfillment.trackingInfo).map((row) => ({
      company: row.company || null,
      number: row.number || null,
      url: row.url || null,
    })),
    line_items: array(fulfillment?.fulfillmentLineItems?.nodes).map((row) => ({
      id: resourceId(row),
      quantity: number(row.quantity),
      line_item_id: resourceId(row.lineItem),
      variant_id: resourceId(row?.lineItem?.variant),
    })),
    shopify_order_id: orderId,
  };
}

async function projectLifecycleAssets({ event, connection, store, order }) {
  const orderId = resourceId(order);
  const transactions = array(order.transactions).map((row) => normalizeTransaction(row, orderId));
  const refunds = array(order.refunds).map((row) => normalizeRefund(row, orderId));
  const fulfillments = array(order.fulfillments).map((row) => normalizeFulfillment(row, orderId));

  for (const transaction of transactions) {
    if (!transaction.id) continue;
    await saveAsset({
      event,
      connection,
      store,
      type: "shopify_order_transaction",
      externalId: transaction.id,
      name: `Shopify ${transaction.kind || "transaction"} ${transaction.id}`,
      metadata: transaction,
    });
  }

  for (const refund of refunds) {
    if (!refund.id) continue;
    await saveAsset({
      event,
      connection,
      store,
      type: "shopify_refund",
      externalId: refund.id,
      name: `Shopify refund ${refund.id}`,
      metadata: refund,
    });
    for (const transaction of refund.transactions) {
      if (!transaction.id) continue;
      await saveAsset({
        event,
        connection,
        store,
        type: "shopify_order_transaction",
        externalId: transaction.id,
        name: `Shopify ${transaction.kind || "transaction"} ${transaction.id}`,
        metadata: transaction,
      });
    }
  }

  for (const fulfillment of fulfillments) {
    if (!fulfillment.id) continue;
    await saveAsset({
      event,
      connection,
      store,
      type: "shopify_fulfillment",
      externalId: fulfillment.id,
      name: fulfillment.name || `Shopify fulfillment ${fulfillment.id}`,
      metadata: fulfillment,
    });
  }

  return { orderId, transactions, refunds, fulfillments };
}

function successfulTransactions(transactions) {
  return transactions.filter((row) => row.status === SUCCESS && row.test !== true);
}

function successfulRefundTransactions(lifecycle) {
  const byId = new Map();
  for (const refund of lifecycle.refunds) {
    for (const transaction of successfulTransactions(refund.transactions)) {
      if (transaction.kind === REFUND_KIND && transaction.id) {
        byId.set(transaction.id, { refund, transaction });
      }
    }
  }
  for (const transaction of successfulTransactions(lifecycle.transactions)) {
    if (transaction.kind === REFUND_KIND && transaction.id && !byId.has(transaction.id)) {
      byId.set(transaction.id, { refund: null, transaction });
    }
  }
  return [...byId.values()];
}

function lifecycleAmounts(order, transactions, refunds) {
  const successful = successfulTransactions(transactions);
  const inflows = successful
    .filter((row) => INFLOW_KINDS.has(row.kind))
    .reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const refundTransactions = new Map();
  for (const refund of refunds) {
    for (const transaction of successfulTransactions(refund.transactions)) {
      if (transaction.kind === REFUND_KIND && transaction.id) {
        refundTransactions.set(transaction.id, transaction);
      }
    }
  }
  for (const transaction of successful) {
    if (transaction.kind === REFUND_KIND && transaction.id) {
      refundTransactions.set(transaction.id, transaction);
    }
  }
  const refunded = [...refundTransactions.values()].reduce(
    (sum, row) => sum + Math.max(row.amount, 0),
    0,
  );
  const total = Math.max(money(order.currentTotalPriceSet), 0);
  const outstanding = Math.max(money(order.totalOutstandingSet), 0);
  const netPaid = Math.max(inflows - refunded, 0);
  return { inflows, refunded, total, outstanding, netPaid };
}

function fulfillmentStatus(order) {
  if (order.cancelledAt) return "CANCELLED";
  const status = text(order.displayFulfillmentStatus).toUpperCase();
  if (status === "FULFILLED") return "FULFILLED";
  if (["PARTIAL", "PARTIALLY_FULFILLED"].includes(status)) return "PARTIALLY_FULFILLED";
  return "NOT_STARTED";
}

function orderStatus(order) {
  const fulfillment = fulfillmentStatus(order);
  if (fulfillment === "CANCELLED") return "CANCELLED";
  if (fulfillment === "FULFILLED") return "FULFILLED";
  if (fulfillment === "PARTIALLY_FULFILLED") return "PARTIALLY_FULFILLED";
  if (order.closedAt) return "CLOSED";
  return "CONFIRMED";
}

function paymentStatus(order, amounts) {
  const display = text(order.displayFinancialStatus).toUpperCase();
  if (amounts.inflows > 0 && amounts.refunded + 0.005 >= amounts.inflows) return "REFUNDED";
  if (display === "VOIDED" && amounts.inflows <= 0.005) return "VOID";
  if (amounts.outstanding <= 0.005 && amounts.netPaid > 0) return "PAID";
  if (amounts.netPaid > 0.005) return "PARTIALLY_PAID";
  return "UNPAID";
}

async function syncCommercial({ event, store, order, lifecycle }) {
  const sourceReference = `shopify:order:${lifecycle.orderId}`;
  const amounts = lifecycleAmounts(order, lifecycle.transactions, lifecycle.refunds);
  const result = await supabaseAdmin.rpc("commercial_sync_external_sales_order_lifecycle_atomic", {
    p_organization_id: event.organization_id,
    p_entity_id: store.entity_id,
    p_source_reference: sourceReference,
    p_status: orderStatus(order),
    p_payment_status: paymentStatus(order, amounts),
    p_fulfillment_status: fulfillmentStatus(order),
    p_paid_amount: amounts.netPaid,
    p_remaining_balance: Math.min(amounts.total, amounts.outstanding),
    p_credited_amount: amounts.refunded,
  });
  if (result.error) throw result.error;
  return { sourceReference, amounts, result: result.data };
}

async function loadSalesOrder(event, store, sourceReference) {
  const result = await supabaseAdmin
    .from("sales_orders")
    .select("id,organization_id,entity_id,party_id,order_number,currency_code,total_amount,tax_amount,status,payment_status,fulfillment_status")
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .eq("source_reference", sourceReference)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SHOPIFY_SALES_ORDER_NOT_PROJECTED");
  return result.data;
}

async function findSourceInvoice(event, store, salesOrder) {
  const result = await supabaseAdmin
    .from("customer_invoices")
    .select("*")
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .eq("source_document_type", "SALES_ORDER")
    .eq("source_document_id", salesOrder.id)
    .eq("document_type", "INVOICE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function ensureInvoice({ event, store, salesOrder, order }) {
  let invoice = await findSourceInvoice(event, store, salesOrder);
  if (invoice) return invoice;
  if (fulfillmentStatus(order) !== "FULFILLED") return null;
  if (!salesOrder.party_id) throw new Error("SHOPIFY_FINANCE_PARTY_MAPPING_REQUIRED");

  const total = Math.max(Number(salesOrder.total_amount || 0), 0);
  const tax = Math.max(Math.min(Number(salesOrder.tax_amount || 0), total), 0);
  const net = Math.max(total - tax, 0);
  if (total <= 0) throw new Error("SHOPIFY_FINANCE_INVOICE_TOTAL_REQUIRED");

  const invoiceDate = isoDate(
    array(order.fulfillments)
      .map((row) => row.deliveredAt || row.updatedAt || row.createdAt)
      .filter(Boolean)
      .sort()
      .at(-1) || order.updatedAt || order.createdAt,
  );

  await createCustomerInvoice({
    organization_id: event.organization_id,
    entity_id: store.entity_id,
    party_id: salesOrder.party_id,
    invoice_date: invoiceDate,
    due_date: invoiceDate,
    currency_code: salesOrder.currency_code,
    lines: [
      {
        description: `Shopify order ${salesOrder.order_number || resourceId(order)}`,
        quantity: 1,
        unit_price: net,
        tax_amount: tax,
      },
    ],
    tax_amount: tax,
    notes: "Automatically recognized from a fully fulfilled Shopify sales order. Source order retains item, discount, tax, shipping, and provider detail.",
    created_by: null,
    idempotency_key: `shopify-invoice:${event.payload.connection_id}:${resourceId(order)}`,
    source_document_type: "SALES_ORDER",
    source_document_id: salesOrder.id,
  });

  invoice = await findSourceInvoice(event, store, salesOrder);
  if (!invoice) throw new Error("SHOPIFY_FINANCE_INVOICE_CREATION_FAILED");
  return invoice;
}

async function loadSettlementBank(event, store) {
  const bankId = text(store?.metadata?.shopify_settlement_bank_account_id);
  if (!bankId) {
    return {
      bank: null,
      missing: [{ code: "SETTLEMENT_BANK", message: "Shopify settlement bank account is not configured" }],
    };
  }

  const result = await supabaseAdmin
    .from("bank_accounts")
    .select("id,organization_id,entity_id,currency,currency_code,active,finance_account_id")
    .eq("id", bankId)
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || result.data.active === false) {
    return {
      bank: null,
      missing: [{ code: "SETTLEMENT_BANK", message: "Shopify settlement bank account is missing or inactive" }],
    };
  }
  return { bank: result.data, missing: [] };
}

function postingCandidates(lifecycle) {
  const candidates = successfulTransactions(lifecycle.transactions)
    .filter((row) => INFLOW_KINDS.has(row.kind));
  for (const item of successfulRefundTransactions(lifecycle)) {
    candidates.push(item.transaction);
  }
  return candidates.filter((row) => Number(row.amount || 0) > 0.005);
}

async function financePreflight({ event, store, salesOrder, lifecycle }) {
  const candidates = postingCandidates(lifecycle);
  if (candidates.length === 0) return { ready: true, bank: null, missing: [] };

  const orderCurrency = text(salesOrder.currency_code).toUpperCase();
  if (!orderCurrency) {
    return {
      ready: false,
      status: "BLOCKED_ACCOUNTING_CONFIGURATION",
      missing: [{ code: "ORDER_CURRENCY", message: "Shopify sales order currency is not configured" }],
    };
  }

  const missingCurrency = candidates.find((row) => !text(row.currency));
  if (missingCurrency) {
    return {
      ready: false,
      status: "BLOCKED_TRANSACTION_CURRENCY_CONFIGURATION",
      missing: [{
        code: "TRANSACTION_CURRENCY_REQUIRED",
        message: "Shopify payment/refund currency is required before Finance posting",
        transaction_id: missingCurrency.id,
        transaction_currency: null,
        order_currency: orderCurrency,
      }],
    };
  }

  const currencyMismatch = candidates.find((row) => {
    const transactionCurrency = text(row.currency).toUpperCase();
    return transactionCurrency !== orderCurrency;
  });
  if (currencyMismatch) {
    return {
      ready: false,
      status: "BLOCKED_TRANSACTION_CURRENCY_MISMATCH",
      missing: [{
        code: "TRANSACTION_ORDER_CURRENCY_MISMATCH",
        message: "Shopify payment/refund currency must match the Finance sales order and invoice currency",
        transaction_id: currencyMismatch.id,
        transaction_currency: text(currencyMismatch.currency).toUpperCase() || null,
        order_currency: orderCurrency,
      }],
    };
  }

  const bankContext = await loadSettlementBank(event, store);
  if (!bankContext.bank) {
    return {
      ready: false,
      status: "BLOCKED_ACCOUNTING_CONFIGURATION",
      missing: bankContext.missing,
    };
  }

  const bankCurrency = text(bankContext.bank.currency_code || bankContext.bank.currency).toUpperCase();
  if (bankCurrency && bankCurrency !== orderCurrency) {
    return {
      ready: false,
      status: "BLOCKED_ACCOUNTING_CONFIGURATION",
      missing: [{
        code: "SETTLEMENT_BANK_CURRENCY",
        message: "Shopify settlement bank currency must match the order transaction currency",
        bank_currency: bankCurrency,
        order_currency: orderCurrency,
      }],
    };
  }

  const readinessByDate = new Map();
  for (const transaction of candidates) {
    const effectiveDate = isoDate(transaction.processed_at || transaction.created_at);
    if (readinessByDate.has(effectiveDate)) continue;
    const readiness = await getCustomerPrepaymentAccountingReadiness({
      organizationId: event.organization_id,
      entityId: store.entity_id,
      bankAccountId: bankContext.bank.id,
      currencyCode: orderCurrency,
      effectiveDate,
    });
    readinessByDate.set(effectiveDate, readiness);
  }

  const missing = [...readinessByDate.entries()].flatMap(([effectiveDate, readiness]) =>
    array(readiness?.missing).map((item) => ({ ...item, effective_date: effectiveDate }))
  );

  if (missing.length > 0) {
    return {
      ready: false,
      status: "BLOCKED_ACCOUNTING_CONFIGURATION",
      bank: bankContext.bank,
      missing,
    };
  }

  return { ready: true, bank: bankContext.bank, missing: [] };
}

async function exchangeRate({ event, store, currency, date }) {
  const rate = await resolveFinanceExchangeRate({
    organizationId: event.organization_id,
    entityId: store.entity_id,
    transactionCurrency: currency,
    effectiveDate: date,
  });
  const value = Number(rate.exchange_rate);
  if (!Number.isFinite(value) || value <= 0) throw new Error("SHOPIFY_FINANCE_EXCHANGE_RATE_REQUIRED");
  return value;
}

function shopifyPaymentId(event, transactionId) {
  return deterministicUuid(`shopify-payment:${event.payload.connection_id}:${transactionId}`);
}

async function postPrepayment({ event, store, salesOrder, transaction, bank }) {
  const amount = Math.max(transaction.amount, 0);
  if (amount <= 0.005) return { skipped: true, reason: "NO_RECEIPT_AMOUNT" };

  const paymentId = shopifyPaymentId(event, transaction.id);
  const paymentDate = isoDate(transaction.processed_at || transaction.created_at);
  const currency = text(transaction.currency || salesOrder.currency_code).toUpperCase();
  const rate = await exchangeRate({ event, store, currency, date: paymentDate });

  return postCustomerPrepayment({
    payment_id: paymentId,
    organization_id: event.organization_id,
    entity_id: store.entity_id,
    party_id: salesOrder.party_id,
    payment_date: paymentDate,
    amount,
    bank_account_id: bank.id,
    payment_method: "SHOPIFY",
    reference_number: transaction.id,
    received_by: null,
    currency_code: currency,
    exchange_rate: rate,
    idempotency_key: `shopify-payment:${event.payload.connection_id}:${transaction.id}`,
    system_automation: true,
  });
}

async function loadPrepaymentBalance({ event, store, salesOrder, paymentId }) {
  const result = await supabaseAdmin
    .from("finance_customer_unapplied_cash")
    .select("id,customer_payment_id,original_amount,available_amount,refunded_amount,currency_code,exchange_rate,status")
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .eq("party_id", salesOrder.party_id)
    .eq("customer_payment_id", paymentId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadPaymentAllocation({ event, store, salesOrder, paymentId, invoiceId }) {
  const result = await supabaseAdmin
    .from("finance_customer_payment_allocations")
    .select("allocated_amount,reversed_amount")
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .eq("party_id", salesOrder.party_id)
    .eq("customer_payment_id", paymentId)
    .eq("customer_invoice_id", invoiceId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function refreshInvoice(invoiceId) {
  const result = await supabaseAdmin
    .from("customer_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function applyPrepaymentToInvoice({ event, store, salesOrder, invoice, transaction }) {
  const paymentId = shopifyPaymentId(event, transaction.id);
  const balance = await loadPrepaymentBalance({ event, store, salesOrder, paymentId });
  if (!balance || Number(balance.available_amount || 0) <= 0.005) {
    return { skipped: true, reason: "NO_UNAPPLIED_PREPAYMENT", payment_id: paymentId };
  }

  const currentInvoice = await refreshInvoice(invoice.id);
  const outstanding = Math.max(Number(currentInvoice.outstanding_balance ?? currentInvoice.outstanding_amount ?? 0), 0);
  if (outstanding <= 0.005) {
    return { skipped: true, reason: "INVOICE_ALREADY_SETTLED", payment_id: paymentId };
  }

  const amount = Math.min(Number(balance.available_amount || 0), outstanding);
  if (amount <= 0.005) return { skipped: true, reason: "NO_ALLOCATABLE_AMOUNT", payment_id: paymentId };

  const applicationDate = isoDate(
    currentInvoice.invoice_date || transaction.processed_at || transaction.created_at
  );
  const applicationId = deterministicUuid(
    `shopify-prepayment-application:${event.payload.connection_id}:${transaction.id}:${invoice.id}`
  );

  return applyCustomerPrepayment({
    application_id: applicationId,
    organization_id: event.organization_id,
    entity_id: store.entity_id,
    party_id: salesOrder.party_id,
    payment_id: paymentId,
    customer_invoice_id: invoice.id,
    application_date: applicationDate,
    amount,
    applied_by: null,
    idempotency_key: `shopify-prepayment-application:${event.payload.connection_id}:${transaction.id}:${invoice.id}`,
    system_automation: true,
  });
}

async function refundAvailablePrepayment({ event, store, salesOrder, transaction, bank }) {
  if (!transaction.parent_transaction_id) {
    return {
      skipped: true,
      reason: "BLOCKED_REFUND_SOURCE_MAPPING",
      refunded_amount: 0,
      remaining_amount: Math.max(transaction.amount, 0),
    };
  }

  const paymentId = shopifyPaymentId(event, transaction.parent_transaction_id);
  const balance = await loadPrepaymentBalance({ event, store, salesOrder, paymentId });
  const available = Math.max(Number(balance?.available_amount || 0), 0);
  const requested = Math.max(transaction.amount, 0);
  const amount = Math.min(available, requested);

  if (!balance || amount <= 0.005) {
    return {
      skipped: true,
      reason: "NO_UNAPPLIED_PREPAYMENT_TO_REFUND",
      payment_id: paymentId,
      refunded_amount: 0,
      remaining_amount: requested,
    };
  }

  const refundDate = isoDate(transaction.processed_at || transaction.created_at);
  const refundId = deterministicUuid(
    `shopify-prepayment-refund:${event.payload.connection_id}:${transaction.id}`
  );
  const result = await refundCustomerPrepayment({
    refund_id: refundId,
    organization_id: event.organization_id,
    entity_id: store.entity_id,
    party_id: salesOrder.party_id,
    payment_id: paymentId,
    refund_date: refundDate,
    amount,
    bank_account_id: bank.id,
    reference_number: transaction.id,
    refunded_by: null,
    idempotency_key: `shopify-prepayment-refund:${event.payload.connection_id}:${transaction.id}`,
    system_automation: true,
  });

  return {
    ...result,
    refunded_amount: amount,
    remaining_amount: Math.max(requested - amount, 0),
  };
}

async function refundInvoicePrepaymentTransaction({
  event,
  store,
  salesOrder,
  invoice,
  refund,
  transaction,
  bank,
}) {
  const requested = Math.max(Number(transaction.amount || 0), 0);
  if (requested <= 0.005) return { skipped: true, reason: "NO_INVOICED_REFUND_AMOUNT" };
  if (!transaction.parent_transaction_id) {
    return { skipped: true, reason: "BLOCKED_REFUND_SOURCE_MAPPING", amount: requested };
  }

  const paymentId = shopifyPaymentId(event, transaction.parent_transaction_id);
  const balance = await loadPrepaymentBalance({ event, store, salesOrder, paymentId });
  if (!balance) {
    return { skipped: true, reason: "BLOCKED_REFUND_PAYMENT_NOT_FOUND", amount: requested };
  }

  const allocation = await loadPaymentAllocation({
    event,
    store,
    salesOrder,
    paymentId,
    invoiceId: invoice.id,
  });
  const available = Math.max(Number(balance.available_amount || 0), 0);
  const applied = Math.max(
    Number(allocation?.allocated_amount || 0) - Number(allocation?.reversed_amount || 0),
    0
  );
  if (requested > available + applied + 0.005) {
    return {
      skipped: true,
      reason: "BLOCKED_REFUND_EXCEEDS_ACCOUNTED_PAYMENT",
      amount: requested,
      available_amount: available,
      applied_amount: applied,
    };
  }

  const refundDate = isoDate(
    transaction.processed_at || transaction.created_at || refund?.processed_at || refund?.updated_at || refund?.created_at
  );
  const seed = `${event.payload.connection_id}:${transaction.id}:${invoice.id}`;

  const result = await refundCustomerPrepaymentAgainstInvoice({
    operation_id: deterministicUuid(`shopify-invoice-prepayment-refund-operation:${seed}`),
    reversal_id: deterministicUuid(`shopify-invoice-prepayment-refund-reversal:${seed}`),
    credit_note_id: deterministicUuid(`shopify-invoice-prepayment-refund-credit:${seed}`),
    refund_id: deterministicUuid(`shopify-invoice-prepayment-refund-cash:${seed}`),
    organization_id: event.organization_id,
    entity_id: store.entity_id,
    party_id: salesOrder.party_id,
    payment_id: paymentId,
    customer_invoice_id: invoice.id,
    refund_date: refundDate,
    amount: requested,
    bank_account_id: bank.id,
    reference_number: transaction.id,
    reason: refund?.note || `Shopify refund ${transaction.id}`,
    actor_id: null,
    idempotency_key: `shopify-invoice-prepayment-refund:${seed}`,
    system_automation: true,
  });

  return {
    ...result,
    refunded_amount: requested,
  };
}

async function processRefunds({ event, store, salesOrder, invoice, lifecycle, bank }) {
  const results = [];

  for (const item of successfulRefundTransactions(lifecycle)) {
    if (invoice) {
      const invoicedRefund = await refundInvoicePrepaymentTransaction({
        event,
        store,
        salesOrder,
        invoice,
        refund: item.refund,
        transaction: item.transaction,
        bank,
      });
      results.push({
        transaction_id: item.transaction.id,
        deposit_refund: null,
        invoiced_refund: invoicedRefund,
      });
      continue;
    }

    const depositRefund = await refundAvailablePrepayment({
      event,
      store,
      salesOrder,
      transaction: item.transaction,
      bank,
    });
    const remaining = Math.max(Number(depositRefund.remaining_amount || 0), 0);
    results.push({
      transaction_id: item.transaction.id,
      deposit_refund: depositRefund,
      invoiced_refund: remaining > 0.005
        ? { skipped: true, reason: "BLOCKED_REFUND_REQUIRES_INVOICE", amount: remaining }
        : null,
    });
  }

  return results;
}

function blockedFinanceResult(mode, preflight) {
  return {
    mode,
    status: preflight.status || "BLOCKED_ACCOUNTING_CONFIGURATION",
    posted_payments: 0,
    posted_refunds: 0,
    posted_prepayments: 0,
    applied_prepayments: 0,
    refunded_prepayments: 0,
    accounting_configuration_missing: preflight.missing || [],
  };
}

async function postFinance({ event, store, salesOrder, order, lifecycle }) {
  const mode = text(store?.metadata?.shopify_finance_sync_mode).toUpperCase() || "OBSERVE_ONLY";
  if (mode !== POST_MODE) {
    return {
      mode,
      status: "OBSERVED_ONLY",
      posted_payments: 0,
      posted_refunds: 0,
      posted_prepayments: 0,
      applied_prepayments: 0,
      refunded_prepayments: 0,
    };
  }
  if (!salesOrder.party_id) {
    return {
      mode,
      status: "BLOCKED_PARTY_MAPPING",
      posted_payments: 0,
      posted_refunds: 0,
      posted_prepayments: 0,
      applied_prepayments: 0,
      refunded_prepayments: 0,
    };
  }

  const preflight = await financePreflight({ event, store, salesOrder, lifecycle });
  if (!preflight.ready) return blockedFinanceResult(mode, preflight);

  const inflows = successfulTransactions(lifecycle.transactions)
    .filter((row) => INFLOW_KINDS.has(row.kind));
  const bank = preflight.bank;

  const prepayments = [];
  for (const transaction of inflows) {
    prepayments.push(await postPrepayment({
      event,
      store,
      salesOrder,
      transaction,
      bank,
    }));
  }

  const invoice = await ensureInvoice({ event, store, salesOrder, order });
  const applications = [];
  if (invoice) {
    for (const transaction of inflows) {
      applications.push(await applyPrepaymentToInvoice({
        event,
        store,
        salesOrder,
        invoice,
        transaction,
      }));
    }
  }

  const refunds = bank
    ? await processRefunds({ event, store, salesOrder, invoice, lifecycle, bank })
    : [];

  const postedPrepayments = prepayments.filter((row) => !row?.skipped).length;
  const appliedPrepayments = applications.filter((row) => !row?.skipped).length;
  const refundedPrepayments = refunds.filter(
    (row) =>
      (row?.deposit_refund && !row.deposit_refund.skipped) ||
      (row?.invoiced_refund && !row.invoiced_refund.skipped)
  ).length;
  const blockedRefunds = refunds.filter(
    (row) =>
      row?.deposit_refund?.reason === "BLOCKED_REFUND_SOURCE_MAPPING" ||
      row?.invoiced_refund?.skipped
  );
  const settledInvoice = invoice ? await refreshInvoice(invoice.id) : null;
  const invoiceOutstanding = settledInvoice
    ? Math.max(Number(settledInvoice.outstanding_balance ?? settledInvoice.outstanding_amount ?? 0), 0)
    : null;

  let status = "DEPOSIT_POSTED";
  if (invoice) status = "INVOICE_OPEN";
  if (invoice && appliedPrepayments > 0) status = "DEPOSIT_APPLIED";
  if (refundedPrepayments > 0 && !invoice) status = "DEPOSIT_REFUNDED";
  if (invoice && blockedRefunds.length === 0 && invoiceOutstanding <= 0.005) status = "RECONCILED";
  if (blockedRefunds.length > 0) status = "BLOCKED_REFUND_RECONCILIATION";

  return {
    mode,
    status,
    customer_invoice_id: invoice?.id || null,
    invoice_outstanding_amount: invoiceOutstanding,
    posted_payments: postedPrepayments,
    posted_refunds: refundedPrepayments,
    posted_prepayments: postedPrepayments,
    applied_prepayments: appliedPrepayments,
    refunded_prepayments: refundedPrepayments,
    prepayments,
    applications,
    refunds,
  };
}

async function completeEvent(event, result) {
  const now = new Date().toISOString();
  const update = await supabaseAdmin
    .from("system_events")
    .update({
      processed: true,
      processed_at: now,
      processing: false,
      processing_started_at: null,
      last_error: null,
      payload: {
        ...object(event.payload),
        shopify_finance_lifecycle: {
          ...result,
          processed_at: now,
        },
      },
    })
    .eq("id", event.id)
    .eq("organization_id", event.organization_id);
  if (update.error) throw update.error;
}

async function failEvent(event, error) {
  const update = await supabaseAdmin
    .from("system_events")
    .update({
      processing: false,
      processing_started_at: null,
      last_error: error?.message || "SHOPIFY_FINANCE_LIFECYCLE_FAILED",
      last_failed_at: new Date().toISOString(),
    })
    .eq("id", event.id)
    .eq("organization_id", event.organization_id);
  if (update.error) throw update.error;
}

async function processEvent(event) {
  const connection = await loadConnection(event);
  const store = await loadStore(event, connection);
  const orderId = orderIdFromEvent(event);
  if (!orderId) throw new Error("SHOPIFY_ORDER_ID_REQUIRED");
  const lifecycleRead = await readLifecycle(event, connection, orderId);
  const lifecycle = await projectLifecycleAssets({
    event,
    connection,
    store,
    order: lifecycleRead.order,
  });
  const commercial = await syncCommercial({
    event,
    store,
    order: lifecycleRead.order,
    lifecycle,
  });
  const salesOrder = await loadSalesOrder(event, store, commercial.sourceReference);
  const finance = await postFinance({
    event,
    store,
    salesOrder,
    order: lifecycleRead.order,
    lifecycle,
  });
  const result = {
    usage_id: lifecycleRead.usage_id,
    shopify_order_id: lifecycle.orderId,
    sales_order_id: salesOrder.id,
    transaction_count: lifecycle.transactions.length,
    refund_count: lifecycle.refunds.length,
    fulfillment_count: lifecycle.fulfillments.length,
    commercial: {
      status: commercial.result?.status || salesOrder.status,
      payment_status: commercial.result?.payment_status || salesOrder.payment_status,
      fulfillment_status: commercial.result?.fulfillment_status || salesOrder.fulfillment_status,
      paid_amount: commercial.amounts.netPaid,
      refunded_amount: commercial.amounts.refunded,
    },
    finance,
  };
  await completeEvent(event, result);
  return { success: true, event_id: event.id, ...result };
}

export async function processShopifyFinanceLifecycle({ limit = 20 } = {}) {
  const claimed = await supabaseAdmin.rpc("claim_shopify_finance_lifecycle_events", {
    p_limit: Math.max(1, Math.min(Number(limit) || 20, 100)),
    p_stale_after_seconds: 300,
  });
  if (claimed.error) throw claimed.error;

  const events = array(claimed.data);
  const results = [];
  for (const event of events) {
    try {
      results.push(await processEvent(event));
    } catch (error) {
      await failEvent(event, error).catch(() => null);
      results.push({
        success: false,
        event_id: event.id,
        error: error?.message || "SHOPIFY_FINANCE_LIFECYCLE_FAILED",
      });
    }
  }

  return {
    success: results.every((row) => row.success),
    claimed: events.length,
    processed: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length,
    results,
  };
}

export default processShopifyFinanceLifecycle;