import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function clean(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

async function requireReceivablesManage(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 }) };
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.receivables.manage",
    fullAccess: access.permissions?.includes("*") === true,
  });
  return { access };
}

async function loadInvoice(organizationId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("customer_invoices")
    .select("id,organization_id,entity_id,party_id,invoice_number,invoice_date,due_date,total_amount,outstanding_balance,outstanding_amount,status,currency_code,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function outstanding(invoice) {
  return money(invoice?.outstanding_balance ?? invoice?.outstanding_amount ?? 0);
}

async function loadBankAccounts(invoice) {
  if (!invoice?.entity_id) return [];
  const currency = clean(invoice.currency_code).toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("id,organization_id,entity_id,bank_name,account_name,account_number,currency,currency_code,active,is_default,finance_account_id")
    .eq("organization_id", invoice.organization_id)
    .eq("entity_id", invoice.entity_id)
    .eq("active", true)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return (data || []).filter((row) => clean(row.currency_code || row.currency).toUpperCase() === currency);
}

async function cardReadiness(invoice) {
  if (!invoice?.entity_id) return { ready: false, reason: "Invoice legal entity is missing" };
  const currency = clean(invoice.currency_code).toUpperCase();

  const [{ data: merchant, error: merchantError }, { data: configs, error: configError }] = await Promise.all([
    supabaseAdmin
      .from("organization_payment_provider_accounts")
      .select("id,provider_account_id,status,charges_enabled,payouts_enabled,details_submitted")
      .eq("organization_id", invoice.organization_id)
      .eq("entity_id", invoice.entity_id)
      .eq("provider", "stripe")
      .eq("purpose", "merchant_payments")
      .maybeSingle(),
    supabaseAdmin
      .from("organization_payment_config")
      .select("id,payment_method,country,currency,enabled,configuration")
      .eq("organization_id", invoice.organization_id)
      .eq("payment_method", "credit_card")
      .eq("enabled", true),
  ]);
  if (merchantError) throw merchantError;
  if (configError) throw configError;

  const config = (configs || []).find((row) => clean(row.currency).toUpperCase() === currency) || null;
  if (!merchant?.provider_account_id || merchant.charges_enabled !== true) {
    return { ready: false, reason: "Stripe merchant onboarding is not complete" };
  }
  if (!config) {
    return { ready: false, reason: `Card payments are not enabled for ${currency}` };
  }
  if (clean(config.configuration?.provider_connection_id) !== clean(merchant.id)) {
    return { ready: false, reason: "Card payment configuration does not match the legal entity merchant connection" };
  }
  return { ready: true, merchant, config };
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const invoiceId = clean(request.nextUrl.searchParams.get("invoiceId") || request.nextUrl.searchParams.get("invoice_id"));
    if (!organizationId || !invoiceId) {
      return NextResponse.json({ success: false, error: "organizationId and invoiceId required" }, { status: 400 });
    }

    const resolved = await requireReceivablesManage(request, organizationId);
    if (resolved.response) return resolved.response;

    const invoice = await loadInvoice(resolved.access.organizationId, invoiceId);
    if (!invoice) return NextResponse.json({ success: false, error: "Customer invoice not found" }, { status: 404 });

    const [bankAccounts, readiness] = await Promise.all([
      loadBankAccounts(invoice),
      cardReadiness(invoice),
    ]);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("customer_portal_payment_requests")
      .select("*")
      .eq("organization_id", resolved.access.organizationId)
      .eq("source_type", "CUSTOMER_INVOICE")
      .eq("source_id", invoice.id)
      .maybeSingle();
    if (existingError) throw existingError;

    return NextResponse.json({
      success: true,
      invoice,
      outstanding_amount: outstanding(invoice),
      bank_accounts: bankAccounts,
      card_readiness: readiness,
      payment_request: existing || null,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to prepare Customer Portal payment request" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const invoiceId = clean(body.invoiceId || body.invoice_id);
    const bankAccountId = clean(body.bankAccountId || body.bank_account_id);
    if (!organizationId || !invoiceId || !bankAccountId) {
      return NextResponse.json({ success: false, error: "organizationId, invoiceId and bankAccountId required" }, { status: 400 });
    }

    const resolved = await requireReceivablesManage(request, organizationId);
    if (resolved.response) return resolved.response;

    const invoice = await loadInvoice(resolved.access.organizationId, invoiceId);
    if (!invoice) return NextResponse.json({ success: false, error: "Customer invoice not found" }, { status: 404 });
    if (!invoice.party_id || !invoice.entity_id) {
      return NextResponse.json({ success: false, error: "Customer invoice must have a Party and legal entity" }, { status: 409 });
    }

    const amount = outstanding(invoice);
    if (!(amount > 0)) {
      return NextResponse.json({ success: false, error: "Customer invoice has no outstanding balance" }, { status: 409 });
    }

    const currency = clean(invoice.currency_code).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ success: false, error: "Customer invoice currency is invalid" }, { status: 409 });
    }

    const [bankAccounts, readiness] = await Promise.all([
      loadBankAccounts(invoice),
      cardReadiness(invoice),
    ]);
    if (!readiness.ready) {
      return NextResponse.json({ success: false, error: readiness.reason || "Card payments are not ready" }, { status: 409 });
    }
    const bankAccount = bankAccounts.find((row) => String(row.id) === bankAccountId);
    if (!bankAccount) {
      return NextResponse.json({ success: false, error: "Settlement bank account is not active for this invoice entity and currency" }, { status: 409 });
    }
    if (!bankAccount.finance_account_id) {
      return NextResponse.json({ success: false, error: "Settlement bank account is not mapped to a Finance account" }, { status: 409 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("customer_portal_payment_requests")
      .select("*")
      .eq("organization_id", resolved.access.organizationId)
      .eq("source_type", "CUSTOMER_INVOICE")
      .eq("source_id", invoice.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "PAID") {
      return NextResponse.json({ success: false, error: "This Customer Portal payment request is already paid" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const payload = {
      organization_id: resolved.access.organizationId,
      entity_id: invoice.entity_id,
      party_id: invoice.party_id,
      source_type: "CUSTOMER_INVOICE",
      source_id: invoice.id,
      description: `Invoice ${invoice.invoice_number || invoice.id}`,
      amount,
      currency_code: currency,
      status: "PENDING",
      provider: "STRIPE",
      bank_account_id: bankAccount.id,
      provider_session_id: null,
      provider_payment_id: null,
      provider_event_id: null,
      settled_at: null,
      idempotency_key: existing?.idempotency_key || `customer-portal-invoice:${invoice.id}`,
      metadata: {
        ...(existing?.metadata || {}),
        invoice_number: invoice.invoice_number || null,
        invoice_updated_at: invoice.updated_at || null,
        settlement_bank_account_id: bankAccount.id,
        merchant_connection_id: readiness.merchant.id,
        issued_by_auth_user_id: resolved.access.user?.id || null,
        checkout_version: Number(existing?.metadata?.checkout_version || 0) + 1,
      },
      updated_at: now,
    };

    let saved;
    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from("customer_portal_payment_requests")
        .update(payload)
        .eq("id", existing.id)
        .eq("organization_id", resolved.access.organizationId)
        .neq("status", "PAID")
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("customer_portal_payment_requests")
        .insert({ ...payload, created_at: now })
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    }

    return NextResponse.json({
      success: true,
      payment_request: saved,
      customer_portal_ready: true,
    }, { status: existing?.id ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to create Customer Portal payment request" }, { status: 500 });
  }
}
