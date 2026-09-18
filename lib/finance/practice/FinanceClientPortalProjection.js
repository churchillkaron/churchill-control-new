import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CLOSED_ITEM_STATUSES = new Set(["COMPLETED", "CANCELLED", "CANCELED", "VOID", "VOIDED"]);
const REVIEW_ITEM_STATUSES = new Set(["READY_FOR_REVIEW", "IN_REVIEW", "REVIEW", "REVIEW_PENDING", "PARTNER_REVIEW"]);
function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function shortDocument(row, source, extra = {}) {
  return {
    id: row.id,
    name: row.document_name || "Document",
    document_type: row.document_type || null,
    status: row.document_status || null,
    version_number: row.version_number || 1,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    source,
    open_path: null,
    ...extra,
  };
}

async function loadFirmAndProfile(grant) {
  const [firmResult, profileResult] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name").eq("id", grant.accounting_firm_id).maybeSingle(),
    supabaseAdmin.from("accounting_client_profiles")
      .select("contact_name,contact_email,contact_phone,tax_id,vat_number,position,whatsapp,assigned_accountant_id,assigned_accountant_name,assigned_partner_id,assigned_partner_name")
      .eq("accounting_firm_id", grant.accounting_firm_id)
      .eq("organization_id", grant.organization_id)
      .maybeSingle(),
  ]);
  if (firmResult.error) throw firmResult.error;
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data || null;
  const staffIds = unique([profile?.assigned_accountant_id, profile?.assigned_partner_id]);
  let staff = [];
  if (staffIds.length) {
    const result = await supabaseAdmin.from("staff_accounts").select("id,name,email,position,active").in("id", staffIds);
    if (result.error) throw result.error;
    staff = result.data || [];
  }
  const staffMap = new Map(staff.map((row) => [row.id, row]));
  const contacts = [];
  if (profile?.assigned_accountant_id || profile?.assigned_accountant_name) {
    const row = staffMap.get(profile?.assigned_accountant_id) || {};
    contacts.push({ role: "Accountant", name: row.name || profile.assigned_accountant_name || "Accounting team", email: row.email || null, position: row.position || null });
  }
  if (profile?.assigned_partner_id || profile?.assigned_partner_name) {
    const row = staffMap.get(profile?.assigned_partner_id) || {};
    contacts.push({ role: "Partner", name: row.name || profile.assigned_partner_name || "Partner", email: row.email || null, position: row.position || null });
  }
  return {
    firm_name: firmResult.data?.name || "Accounting team",
    profile: profile ? {
      contact_name: profile.contact_name || null,
      contact_email: profile.contact_email || null,
      contact_phone: profile.contact_phone || null,
      tax_id: profile.tax_id || null,
      vat_number: profile.vat_number || null,
      position: profile.position || null,
      whatsapp: profile.whatsapp || null,
    } : null,
    contacts,
  };
}

async function loadRunsAndWork(grant, engagement) {
  const { data: runs, error: runError } = await supabaseAdmin.from("accounting_engagement_runs")
    .select("id,status,locked_at,due_at,period_id,entity_id,created_at")
    .eq("accounting_firm_id", grant.accounting_firm_id)
    .eq("engagement_id", engagement.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (runError) throw runError;
  const runIds = (runs || []).map((row) => row.id);
  let items = [];
  if (runIds.length) {
    const result = await supabaseAdmin.from("accounting_engagement_work_items")
      .select("id,run_id,title,work_type,status,capability_id,blocked_reason,updated_at")
      .eq("accounting_firm_id", grant.accounting_firm_id)
      .in("run_id", runIds)
      .limit(5000);
    if (result.error) throw result.error;
    items = result.data || [];
  }
  const openItems = items.filter((row) => !CLOSED_ITEM_STATUSES.has(upper(row.status)));
  const reviewItems = openItems.filter((row) => REVIEW_ITEM_STATUSES.has(upper(row.status)));
  const activeRun = (runs || []).find((row) => !row.locked_at && !CLOSED_ITEM_STATUSES.has(upper(row.status))) || (runs || [])[0] || null;
  return {
    runs: runs || [],
    items,
    work_status: {
      overall: reviewItems.length ? "UNDER_REVIEW" : openItems.length ? "WITH_ACCOUNTANT" : activeRun ? "WITH_ACCOUNTANT" : "COMPLETED",
      open_items: openItems.length,
      under_review: reviewItems.length,
      latest_due_at: activeRun?.due_at || null,
      latest_run_status: activeRun?.status || null,
    },
  };
}

async function loadDocumentsAndApprovals(grant, engagement, work) {
  const runIds = work.runs.map((row) => row.id);
  const requestItemIds = work.items.filter((row) => row.work_type === "CLIENT_REQUEST" && row.capability_id === "documents").map((row) => row.id);
  const [contractLinksResult, evidenceLinksResult] = await Promise.all([
    supabaseAdmin.from("enterprise_document_links")
      .select("enterprise_document_id,created_at")
      .eq("organization_id", grant.accounting_firm_id)
      .eq("reference_type", "ACCOUNTING_ENGAGEMENT")
      .eq("reference_id", engagement.id)
      .eq("relation_type", "CONTRACT")
      .order("created_at", { ascending: false }),
    requestItemIds.length && runIds.length
      ? supabaseAdmin.from("accounting_work_program_evidence_links")
          .select("document_id,evidence_category,linked_at,work_item_id")
          .eq("accounting_firm_id", grant.accounting_firm_id)
          .eq("engagement_id", engagement.id)
          .in("run_id", runIds)
          .in("work_item_id", requestItemIds)
          .eq("status", "ACTIVE")
          .order("linked_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (contractLinksResult.error) throw contractLinksResult.error;
  if (evidenceLinksResult.error) throw evidenceLinksResult.error;
  const contractIds = unique((contractLinksResult.data || []).map((row) => row.enterprise_document_id));
  const evidenceIds = unique((evidenceLinksResult.data || []).map((row) => row.document_id));
  const [contractDocsResult, evidenceDocsResult] = await Promise.all([
    contractIds.length
      ? supabaseAdmin.from("enterprise_documents").select("id,document_name,document_type,document_status,version_number,created_at,updated_at").eq("organization_id", grant.accounting_firm_id).in("id", contractIds)
      : Promise.resolve({ data: [], error: null }),
    evidenceIds.length
      ? supabaseAdmin.from("enterprise_documents").select("id,document_name,document_type,document_status,version_number,created_at,updated_at").eq("organization_id", grant.organization_id).in("id", evidenceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (contractDocsResult.error) throw contractDocsResult.error;
  if (evidenceDocsResult.error) throw evidenceDocsResult.error;
  const categoryByDocument = new Map((evidenceLinksResult.data || []).map((row) => [row.document_id, row.evidence_category || null]));
  const documents = [
    ...(contractDocsResult.data || []).map((row) => shortDocument(row, "ENGAGEMENT_CONTRACT", { open_path: `documents/${row.id}` })),
    ...(evidenceDocsResult.data || []).map((row) => shortDocument(row, "CLIENT_UPLOAD", { evidence_category: categoryByDocument.get(row.id) || null, open_path: `documents/${row.id}` })),
  ];
  let approvals = [];
  if (contractIds.length && grant.client_email) {
    const { data, error } = await supabaseAdmin.from("document_signature_requests")
      .select("id,enterprise_document_id,signer_name,signer_email,status,requested_at,expires_at,signed_at,declined_at")
      .eq("organization_id", grant.accounting_firm_id)
      .in("enterprise_document_id", contractIds)
      .ilike("signer_email", grant.client_email)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    const docMap = new Map((contractDocsResult.data || []).map((row) => [row.id, row]));
    approvals = (data || []).map((row) => ({
      id: row.id,
      document_id: row.enterprise_document_id,
      document_name: docMap.get(row.enterprise_document_id)?.document_name || "Engagement document",
      signer_name: row.signer_name || grant.client_name || null,
      status: row.status,
      requested_at: row.requested_at,
      expires_at: row.expires_at,
      signed_at: row.signed_at,
      declined_at: row.declined_at,
      open_path: `documents/${row.enterprise_document_id}`,
      sign_path: `signatures/${row.id}`,
    }));
  }
  return { documents, approvals };
}

async function loadBilling(grant, engagement) {
  const { data: batches, error: batchError } = await supabaseAdmin.from("accounting_practice_billing_batches")
    .select("id,billing_period_key,invoice_id,service_period_start,service_period_end,total_amount,currency_code,status,invoiced_at")
    .eq("accounting_firm_id", grant.accounting_firm_id)
    .eq("engagement_id", engagement.id)
    .eq("status", "INVOICED")
    .order("invoiced_at", { ascending: false, nullsFirst: false });
  if (batchError) throw batchError;
  const invoiceIds = unique((batches || []).map((row) => row.invoice_id));
  if (!invoiceIds.length) return { invoices: [], payments: [] };
  const [invoiceResult, paymentResult] = await Promise.all([
    supabaseAdmin.from("customer_invoices")
      .select("id,invoice_number,invoice_date,due_date,total_amount,outstanding_balance,outstanding_amount,status,currency_code,entity_id")
      .eq("organization_id", grant.accounting_firm_id)
      .in("id", invoiceIds),
    supabaseAdmin.from("customer_payments")
      .select("id,customer_invoice_id,payment_number,payment_date,amount,allocated_amount,currency_code,payment_method,reference_number,status")
      .eq("organization_id", grant.accounting_firm_id)
      .in("customer_invoice_id", invoiceIds)
      .order("payment_date", { ascending: false }),
  ]);
  if (invoiceResult.error) throw invoiceResult.error;
  if (paymentResult.error) throw paymentResult.error;
  const batchByInvoice = new Map((batches || []).map((row) => [row.invoice_id, row]));
  const paymentsByInvoice = new Map();
  for (const payment of paymentResult.data || []) {
    const rows = paymentsByInvoice.get(payment.customer_invoice_id) || [];
    rows.push(payment);
    paymentsByInvoice.set(payment.customer_invoice_id, rows);
  }
  const invoices = (invoiceResult.data || []).map((row) => {
    const batch = batchByInvoice.get(row.id) || {};
    const invoicePayments = paymentsByInvoice.get(row.id) || [];
    const paid = upper(row.status) === "PAID" || number(row.outstanding_balance ?? row.outstanding_amount) <= 0;
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      total_amount: number(row.total_amount),
      outstanding_amount: number(row.outstanding_balance ?? row.outstanding_amount),
      currency_code: row.currency_code || batch.currency_code || "THB",
      status: row.status,
      billing_period_key: batch.billing_period_key || null,
      service_period_start: batch.service_period_start || null,
      service_period_end: batch.service_period_end || null,
      invoice_path: `invoices/${row.id}?mode=invoice`,
      receipt_path: paid && invoicePayments.length ? `invoices/${row.id}?mode=receipt` : null,
    };
  });
  return { invoices, payments: paymentResult.data || [] };
}

async function loadFilings(grant, engagement) {
  if (engagement.vat_enabled !== true && engagement.tax_enabled !== true) return [];
  let query = supabaseAdmin.from("finance_vat_returns")
    .select("id,return_number,period_start,period_end,filing_due_date,tax_payable,tax_refund,currency_code,submission_reference,submitted_at,status,jurisdiction_code,registration_reference")
    .eq("organization_id", grant.organization_id)
    .order("period_end", { ascending: false })
    .limit(100);
  const entityId = grant.entity_id || engagement.entity_id || null;
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    return_number: row.return_number || null,
    period_start: row.period_start,
    period_end: row.period_end,
    filing_due_date: row.filing_due_date,
    tax_payable: number(row.tax_payable),
    tax_refund: number(row.tax_refund),
    currency_code: row.currency_code || "THB",
    submission_reference: row.submission_reference || null,
    submitted_at: row.submitted_at || null,
    status: row.status,
    jurisdiction_code: row.jurisdiction_code || null,
    registration_reference: row.registration_reference || null,
  }));
}

async function loadMessages(grant, engagement, { markRead = true } = {}) {
  const { data, error } = await supabaseAdmin.from("accounting_client_portal_messages")
    .select("id,sender_type,sender_name,sender_email,body,read_by_client_at,read_by_firm_at,created_at")
    .eq("accounting_firm_id", grant.accounting_firm_id)
    .eq("engagement_id", engagement.id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  if (markRead) {
    const unread = (data || []).filter((row) => row.sender_type === "ACCOUNTING_FIRM" && !row.read_by_client_at).map((row) => row.id);
    if (unread.length) {
      const { error: updateError } = await supabaseAdmin.from("accounting_client_portal_messages").update({ read_by_client_at: new Date().toISOString() }).in("id", unread).eq("accounting_firm_id", grant.accounting_firm_id).eq("engagement_id", engagement.id);
      if (updateError) throw updateError;
    }
  }
  return data || [];
}

export async function loadFinanceClientPortalProjection({ grant, engagement, markMessagesRead = true } = {}) {
  if (!grant?.id || !engagement?.id) throw new Error("Portal grant and engagement are required");
  const [identity, work, filings, messages] = await Promise.all([
    loadFirmAndProfile(grant),
    loadRunsAndWork(grant, engagement),
    loadFilings(grant, engagement),
    loadMessages(grant, engagement, { markRead: markMessagesRead }),
  ]);
  const [documentProjection, billing] = await Promise.all([
    loadDocumentsAndApprovals(grant, engagement, work),
    loadBilling(grant, engagement),
  ]);
  return {
    ...identity,
    work_status: work.work_status,
    documents: documentProjection.documents,
    approvals: documentProjection.approvals,
    invoices: billing.invoices,
    payments: billing.payments,
    filings,
    messages,
  };
}
