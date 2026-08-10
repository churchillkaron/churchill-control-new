import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getCustomer } from "@/lib/commercial/customers/CustomerService";
import {
  listLoyaltyLedger,
  listLoyaltyWorkspace,
} from "@/lib/commercial/customers/LoyaltyService";
import {
  getCustomerAccountCommand,
} from "@/lib/finance/accounts-receivable/runtime/CustomerAccountApplicationService";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, field) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    const error = new Error(`${field} must be a UUID`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function throwResult(result, fallback) {
  if (result?.error) {
    const error = new Error(result.error.message || fallback);
    error.status = 500;
    throw error;
  }
  return result?.data || [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(left, right) {
  return new Date(right?.event_at || 0).getTime() -
    new Date(left?.event_at || 0).getTime();
}

function financeTimeline(account = {}) {
  return (account.transactions || []).map((row) => ({
    id: `finance:${row.event_type || "event"}:${row.document_id || row.reference || row.event_at}`,
    event_at: row.event_at,
    domain: "Finance",
    type: row.event_type || "FINANCE_EVENT",
    reference: row.reference || null,
    status: row.status || null,
    amount: number(row.amount),
    currency_code: row.currency_code || null,
    document_id: row.document_id || null,
    source_document_type: row.source_document_type || null,
    source_document_id: row.source_document_id || null,
  }));
}

function commercialTimeline(quotations = [], orders = []) {
  return [
    ...quotations.map((row) => ({
      id: `quotation:${row.id}`,
      event_at: row.created_at,
      domain: "Commercial",
      type: "QUOTATION",
      reference: row.quotation_number,
      status: row.status,
      amount: number(row.total_amount),
      currency_code: row.currency_code || null,
      document_id: row.id,
      source_document_type: "QUOTATION",
      source_document_id: row.id,
    })),
    ...orders.map((row) => ({
      id: `sales-order:${row.id}`,
      event_at: row.created_at,
      domain: "Commercial",
      type: "SALES_ORDER",
      reference: row.order_number,
      status: row.status,
      fulfillment_status: row.fulfillment_status || null,
      payment_status: row.payment_status || null,
      amount: number(row.total_amount),
      currency_code: row.currency_code || null,
      document_id: row.id,
      source_document_type: "SALES_ORDER",
      source_document_id: row.id,
    })),
  ];
}

function loyaltyTimeline(ledger = []) {
  return ledger.map((row) => ({
    id: `loyalty:${row.id}`,
    event_at: row.created_at,
    domain: "Commercial",
    type: `LOYALTY_${String(row.entry_type || "EVENT").toUpperCase()}`,
    reference: row.source_document_type || row.source_domain || "Loyalty",
    status: null,
    points_delta: number(row.points_delta),
    balance_after: number(row.balance_after),
    amount: row.monetary_value === null ? null : number(row.monetary_value),
    currency_code: row.currency_code || null,
    document_id: row.id,
    source_document_type: row.source_document_type || null,
    source_document_id: row.source_document_id || null,
  }));
}

function collectionsTimeline(rows = []) {
  return rows.map((row) => ({
    id: `collection:${row.id}`,
    event_at: row.created_at,
    domain: "Finance",
    type: `COLLECTION_${String(row.activity_type || "ACTIVITY").toUpperCase()}`,
    reference: row.collection_case_id || null,
    status: row.outcome || null,
    amount:
      row.promise_amount === null || row.promise_amount === undefined
        ? null
        : number(row.promise_amount),
    currency_code: null,
    document_id: row.id,
    source_document_type: "COLLECTION_ACTIVITY",
    source_document_id: row.collection_case_id || null,
  }));
}

export async function getCustomerDetail({
  organizationId,
  entityId,
  partyId,
  asOfDate,
}) {
  const organization_id = requiredUuid(organizationId, "organization_id");
  const entity_id = requiredUuid(entityId, "entity_id");
  const party_id = requiredUuid(partyId, "party_id");

  const customer = await getCustomer({
    organizationId: organization_id,
    partyId: party_id,
  });

  if (!customer) {
    const error = new Error("Customer Party not found in organization");
    error.status = 404;
    throw error;
  }

  const [
    account,
    loyaltyWorkspace,
    loyaltyLedger,
    redemptionResult,
    quotationResult,
    orderResult,
    collectionActivityResult,
    paymentResult,
    creditResult,
    creditApplicationResult,
  ] = await Promise.all([
    getCustomerAccountCommand({
      organization_id,
      entity_id,
      party_id,
      as_of_date: asOfDate,
    }),
    listLoyaltyWorkspace({
      organizationId: organization_id,
      partyId: party_id,
    }),
    listLoyaltyLedger({
      organizationId: organization_id,
      partyId: party_id,
      limit: 100,
    }),
    supabaseAdmin
      .from("commercial_loyalty_redemptions")
      .select(
        "id,program_id,reward_id,points_spent,monetary_value,currency_code,status,finance_effect_status,redeemed_at,reversed_at"
      )
      .eq("organization_id", organization_id)
      .eq("party_id", party_id)
      .order("redeemed_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("commercial_quotations")
      .select(
        "id,quotation_number,status,currency_code,total_amount,valid_until,sales_order_id,sent_at,accepted_at,converted_at,created_at,updated_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("sales_orders")
      .select(
        "id,order_number,status,payment_status,fulfillment_status,currency_code,total_amount,paid_amount,credited_amount,remaining_balance,source_type,source_reference,confirmed_at,cancelled_at,created_at,updated_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("customer_collection_activities")
      .select(
        "id,collection_case_id,customer_invoice_id,activity_type,notes,outcome,follow_up_at,promise_amount,promise_date,created_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("customer_payments")
      .select(
        "id,payment_number,payment_date,amount,payment_method,reference_number,currency_code,status,allocated_amount,unapplied_amount,posted_at,reversed_at,refunded_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("payment_date", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("finance_customer_credits")
      .select(
        "id,credit_note_invoice_id,source_invoice_id,original_amount,available_amount,applied_amount,refunded_amount,currency_code,status,created_at,updated_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("finance_customer_credit_applications")
      .select(
        "id,customer_credit_id,target_invoice_id,amount,balance_before,balance_after,applied_at,reversed_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .eq("party_id", party_id)
      .order("applied_at", { ascending: false })
      .limit(100),
  ]);

  const redemptions = throwResult(
    redemptionResult,
    "Unable to load loyalty redemptions"
  );
  const quotations = throwResult(
    quotationResult,
    "Unable to load customer quotations"
  );
  const salesOrders = throwResult(
    orderResult,
    "Unable to load customer sales orders"
  );
  const collectionActivities = throwResult(
    collectionActivityResult,
    "Unable to load collection activity"
  );
  const payments = throwResult(
    paymentResult,
    "Unable to load customer payments"
  );
  const credits = throwResult(
    creditResult,
    "Unable to load customer credits"
  );
  const creditApplications = throwResult(
    creditApplicationResult,
    "Unable to load customer credit applications"
  );

  const paymentIds = payments.map((row) => row.id).filter(Boolean);
  let paymentAllocations = [];

  if (paymentIds.length) {
    const allocationResult = await supabaseAdmin
      .from("customer_payment_allocations")
      .select(
        "id,customer_payment_id,customer_invoice_id,accounts_receivable_id,amount,allocation_date,reference,reversed_at,created_at"
      )
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .in("customer_payment_id", paymentIds)
      .order("created_at", { ascending: false })
      .limit(200);

    paymentAllocations = throwResult(
      allocationResult,
      "Unable to load customer payment allocations"
    );
  }

  const loyaltyAccount = loyaltyWorkspace.accounts?.[0] || null;
  const loyaltyProgram =
    loyaltyWorkspace.programs?.find(
      (program) => program.id === loyaltyAccount?.program_id
    ) || null;
  const loyaltyTier =
    loyaltyWorkspace.tiers?.find(
      (tier) => tier.id === loyaltyAccount?.tier_id
    ) || null;
  const rewards = (loyaltyWorkspace.rewards || []).filter(
    (reward) => !loyaltyAccount?.program_id || reward.program_id === loyaltyAccount.program_id
  );
  const rewardById = new Map(rewards.map((reward) => [reward.id, reward]));

  const mappedRedemptions = redemptions.map((redemption) => ({
    ...redemption,
    reward_name: rewardById.get(redemption.reward_id)?.name || null,
    reward_code: rewardById.get(redemption.reward_id)?.code || null,
  }));

  const invoiceById = new Map(
    (account.transactions || [])
      .filter((row) => row.document_id && row.event_type === "INVOICE")
      .map((row) => [row.document_id, row.reference])
  );
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const mappedAllocations = paymentAllocations.map((allocation) => ({
    ...allocation,
    payment_number:
      paymentById.get(allocation.customer_payment_id)?.payment_number || null,
    invoice_reference:
      invoiceById.get(allocation.customer_invoice_id) || null,
  }));

  const timeline = [
    ...commercialTimeline(quotations, salesOrders),
    ...financeTimeline(account),
    ...loyaltyTimeline(loyaltyLedger),
    ...collectionsTimeline(collectionActivities),
  ]
    .filter((row) => row.event_at)
    .sort(newestFirst)
    .slice(0, 100);

  return {
    ...customer,
    id: party_id,
    party_id,
    organization_id,
    entity_id,
    as_of_date: account.as_of_date || asOfDate || null,
    finance: {
      balances: account.balances || [],
      transactions: account.transactions || [],
      payments,
      payment_allocations: mappedAllocations,
      credits,
      credit_applications: creditApplications,
      statements: account.recent_statements || [],
      collection_cases: account.collections || [],
      collection_activities: collectionActivities,
    },
    loyalty: {
      account: loyaltyAccount,
      program: loyaltyProgram,
      tier: loyaltyTier,
      rewards,
      ledger: loyaltyLedger,
      redemptions: mappedRedemptions,
    },
    commercial: {
      quotations,
      sales_orders: salesOrders,
    },
    timeline,
  };
}

export default Object.freeze({
  getCustomerDetail,
});
