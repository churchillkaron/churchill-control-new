import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import createCustomerInvoice from "@/lib/finance/accounts-receivable/documents/createCustomerInvoice";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";
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

async function validSettlementBank(event, store, currency) {
  const bankId = text(store?.metadata?.shopify_settlement_bank_account_id);
  if (!bankId) throw new Error("SHOPIFY_SETTLEMENT_BANK_ACCOUNT_REQUIRED");
  const result = await supabaseAdmin
    .from("bank_accounts")
    .select("id,organization_id,entity_id,currency,currency_code,active")
    .eq("id", bankId)
    .eq("organization_id", event.organization_id)
    .eq("entity_id", store.entity_id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || result.data.active === false) throw new Error("SHOPIFY_SETTLEMENT_BANK_ACCOUNT_INVALID");
  const bankCurrency = text(result.data.currency_code || result.data.currency).toUpperCase();
  if (bankCurrency && bankCurrency !== text(currency).toUpperCase()) {
    throw new Error("SHOPIFY_SETTLEMENT_BANK_ACCOUNT_CURRENCY_MISMATCH");
  }
  return result.data;
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

async function postPayment({ event, store, salesOrder, invoice, transaction, bank }) {
  const outstanding = Math.max(Number(invoice.outstanding_balance ?? invoice.outstanding_amount ?? 0), 0);
  if (outstanding <= 0.005) return { skipped: true, reason: "INVOICE_ALREADY_SETTLED" };
  const amount = Math.min(Math.max(transaction.amount, 0), outstanding);
  if (amount <= 0.005) return { skipped: true, reason: "NO_ALLOCATABLE_AMOUNT" };

  const paymentId = deterministicUuid(`shopify-payment:${event.payload.connection_id}:${transaction.id}`);
  const paymentDate = isoDate(transaction.processed_at || transaction.created_at);
  const currency = text(transaction.currency || salesOrder.currency_code).toUpperCase();
  const rate = await exchangeRate({ event, store, currency, date: paymentDate });
  const journal = await prepareAccountingEventJournal({
    event: {
      id: `shopify-payment:${transaction.id}`,
      organization_id: event.organization_id,
      entity_id: store.entity_id,
      event_type: "CUSTOMER_PAYMENT_RECEIVED",
      source_module: "accounts_receivable",
      source_id: paymentId,
      occurred_at: transaction.processed_at || transaction.created_at || new Date().toISOString(),
      payload: {
        party_id: salesOrder.party_id,
        source_document: "customer_payment",
        source_document_id: paymentId,
        amount,
        allocated_amount: amount,
        unapplied_amount: 0,
        currency_code: currency,
        exchange_rate: rate,
        entry_date: paymentDate,
        description: `Shopify receipt ${transaction.id}`,
      },
    },
  });

  const result = await supabaseAdmin.rpc("finance_post_customer_receipt_party_idempotent", {
    p_payment_id: paymentId,
    p_organization_id: event.organization_id,
    p_entity_id: store.entity_id,
    p_party_id: salesOrder.party_id,
    p_payment_date: paymentDate,
    p_payment_amount: amount,
    p_bank_account_id: bank.id,
    p_payment_method: "SHOPIFY",
    p_reference_number: transaction.id,
    p_paid_by: null,
    p_currency_code: currency,
    p_exchange_rate: rate,
    p_allocations: [{ customer_invoice_id: invoice.id, amount }],
    p_journal_lines: journal.lines,
    p_idempotency_key: `shopify-payment:${event.payload.connection_id}:${transaction.id}`,
  });
  if (result.error) throw result.error;
  return result.data;
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

async function issueRefundCredit({ event, store, salesOrder, invoice, refund, bank }) {
  const successfulRefunds = successfulTransactions(refund.transactions).filter((row) => row.kind === REFUND_KIND);
  const amount = successfulRefunds.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  if (amount <= 0.005) return { skipped: true, reason: "NO_SUCCESSFUL_REFUND_TRANSACTION" };

  invoice = await refreshInvoice(invoice.id);
  const outstanding = Math.max(Number(invoice.outstanding_balance ?? invoice.outstanding_amount ?? 0), 0);
  if (outstanding > 0.005) {
    return { skipped: true, reason: "REFUND_REQUIRES_SETTLED_SOURCE_INVOICE" };
  }

  const creditNoteId = deterministicUuid(`shopify-credit-note:${event.payload.connection_id}:${refund.id}`);
  const creditDate = isoDate(refund.processed_at || refund.updated_at || refund.created_at);
  const creditResult = await supabaseAdmin.rpc("finance_issue_customer_credit_note_idempotent", {
    p_credit_note_id: creditNoteId,
    p_organization_id: event.organization_id,
    p_entity_id: store.entity_id,
    p_party_id: salesOrder.party_id,
    p_source_invoice_id: invoice.id,
    p_credit_date: creditDate,
    p_amount: amount,
    p_reason: refund.note || `Shopify refund ${refund.id}`,
    p_created_by: null,
    p_idempotency_key: `shopify-credit-note:${event.payload.connection_id}:${refund.id}`,
    p_prefix: "CN",
  });
  if (creditResult.error) throw creditResult.error;

  const customerCreditId = creditResult.data?.customer_credit_id;
  if (!customerCreditId) throw new Error("SHOPIFY_CUSTOMER_CREDIT_NOT_CREATED");
  const currency = text(refund.currency || salesOrder.currency_code).toUpperCase();
  const rate = await exchangeRate({ event, store, currency, date: creditDate });

  const receiptJournal = await prepareAccountingEventJournal({
    event: {
      id: `shopify-refund:${refund.id}`,
      organization_id: event.organization_id,
      entity_id: store.entity_id,
      event_type: "CUSTOMER_PAYMENT_RECEIVED",
      source_module: "accounts_receivable",
      source_id: deterministicUuid(`shopify-refund-journal:${event.payload.connection_id}:${refund.id}`),
      occurred_at: refund.processed_at || refund.updated_at || refund.created_at || new Date().toISOString(),
      payload: {
        party_id: salesOrder.party_id,
        amount,
        currency_code: currency,
        exchange_rate: rate,
        entry_date: creditDate,
        description: `Shopify refund ${refund.id}`,
      },
    },
  });
  const reversalLines = journalReverse(receiptJournal.lines);
  const refundId = deterministicUuid(`shopify-credit-refund:${event.payload.connection_id}:${refund.id}`);
  const refundResult = await supabaseAdmin.rpc("finance_refund_customer_credit_idempotent", {
    p_refund_id: refundId,
    p_organization_id: event.organization_id,
    p_entity_id: store.entity_id,
    p_party_id: salesOrder.party_id,
    p_customer_credit_id: customerCreditId,
    p_bank_account_id: bank.id,
    p_refund_date: creditDate,
    p_amount: amount,
    p_reference_number: refund.id,
    p_refunded_by: null,
    p_journal_lines: reversalLines,
    p_idempotency_key: `shopify-credit-refund:${event.payload.connection_id}:${refund.id}`,
  });
  if (refundResult.error) throw refundResult.error;
  return { credit: creditResult.data, refund: refundResult.data };
}

function journalReverse(lines) {
  return array(lines).map((line) => ({
    ...line,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
  }));
}

async function postFinance({ event, store, salesOrder, order, lifecycle }) {
  const mode = text(store?.metadata?.shopify_finance_sync_mode).toUpperCase() || "OBSERVE_ONLY";
  if (mode !== POST_MODE) {
    return { mode, status: "OBSERVED_ONLY", posted_payments: 0, posted_refunds: 0 };
  }
  if (!salesOrder.party_id) {
    return { mode, status: "BLOCKED_PARTY_MAPPING", posted_payments: 0, posted_refunds: 0 };
  }

  const invoice = await ensureInvoice({ event, store, salesOrder, order });
  if (!invoice) {
    return { mode, status: "PENDING_FULL_FULFILLMENT", posted_payments: 0, posted_refunds: 0 };
  }

  const bank = await validSettlementBank(event, store, salesOrder.currency_code);
  const inflows = successfulTransactions(lifecycle.transactions).filter((row) => INFLOW_KINDS.has(row.kind));
  const payments = [];
  for (const transaction of inflows) {
    const currentInvoice = await refreshInvoice(invoice.id);
    payments.push(await postPayment({
      event,
      store,
      salesOrder,
      invoice: currentInvoice,
      transaction,
      bank,
    }));
  }

  const refunds = [];
  for (const refund of lifecycle.refunds) {
    refunds.push(await issueRefundCredit({ event, store, salesOrder, invoice, refund, bank }));
  }

  return {
    mode,
    status: "RECONCILED",
    customer_invoice_id: invoice.id,
    posted_payments: payments.filter((row) => !row?.skipped).length,
    posted_refunds: refunds.filter((row) => !row?.skipped).length,
    payments,
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
