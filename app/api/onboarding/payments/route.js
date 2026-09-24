export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { OrganizationPaymentOnboardingRuntime } from "@/lib/platform/payment-runtime/onboarding/OrganizationPaymentOnboardingRuntime";

function clean(value) { return String(value ?? "").trim(); }
function originFromRequest(request) {
  try { return new URL(request.url).origin; } catch { return ""; }
}

async function context(organizationId) {
  const [orgResult, entityResult, configResult, providerResult] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name,country").eq("id", organizationId).maybeSingle(),
    supabaseAdmin.from("legal_entities").select("id,legal_name,display_name,country,currency,is_default_accounting_entity,is_active").eq("organization_id", organizationId).eq("is_active", true).order("is_default_accounting_entity", { ascending:false }).limit(1).maybeSingle(),
    supabaseAdmin.from("organization_payment_config").select("payment_method,country,currency,enabled,configuration,updated_at").eq("organization_id", organizationId),
    supabaseAdmin.from("organization_payment_provider_accounts").select("id,provider,purpose,status,charges_enabled,payouts_enabled,details_submitted,requirements,updated_at").eq("organization_id", organizationId),
  ]);
  if (orgResult.error) throw orgResult.error;
  if (entityResult.error) throw entityResult.error;
  if (configResult.error) throw configResult.error;
  if (providerResult.error) throw providerResult.error;
  if (!entityResult.data?.id) throw new Error("DEFAULT_LEGAL_ENTITY_REQUIRED");
  return {
    organization: orgResult.data,
    entity: entityResult.data,
    configs: configResult.data || [],
    providers: providerResult.data || [],
  };
}

function safeConfiguration(row) {
  const configuration = row?.configuration && typeof row.configuration === "object" ? row.configuration : {};
  return {
    provider: configuration.provider || null,
    bank_account_id: configuration.bank_account_id || null,
    banking_integration_id: configuration.banking_integration_id || null,
    promptpay_configured: Boolean(configuration.promptpay_identifier),
    provider_connection_id: configuration.provider_connection_id || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });
    const data = await context(access.organizationId);
    return Response.json({
      success:true,
      organization:{ id:data.organization?.id, name:data.organization?.name || data.entity.display_name || data.entity.legal_name },
      entity:data.entity,
      paymentConfigs:data.configs.map((row) => ({ ...row, configuration:safeConfiguration(row) })),
      providerAccounts:data.providers,
    });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Unable to load payment setup" }, { status:500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });
    const data = await context(access.organizationId);
    const paymentSetup = {
      enableBankTransfer: body.enableBankTransfer === true,
      enablePromptPay: body.enablePromptPay === true,
      enableCards: body.enableCards === true,
      promptPayId: clean(body.promptPayId),
      bank: {
        bankName: clean(body.bankName),
        accountName: clean(body.bankAccountName),
        accountNumber: clean(body.bankAccountNumber),
      },
    };
    if (paymentSetup.enablePromptPay && String(data.entity.country || "").toUpperCase() !== "TH") {
      return Response.json({ success:false, error:"PromptPay is only available for Thailand entities" }, { status:400 });
    }
    const result = await OrganizationPaymentOnboardingRuntime.configure({
      organizationId: access.organizationId,
      entity: data.entity,
      ownerEmail: access.user?.email || access.userEmail || null,
      businessName: data.organization?.name || data.entity.display_name || data.entity.legal_name,
      country: data.entity.country || data.organization?.country,
      currency: data.entity.currency,
      paymentSetup,
      appOrigin: originFromRequest(request),
    });
    return Response.json({ success:true, result });
  } catch (error) {
    const message = error?.message || "Unable to configure payments";
    const status = /INCOMPLETE|COUNTRY_CODE_UNRESOLVED|PromptPay|REQUIRED/.test(message) ? 400 : 500;
    return Response.json({ success:false, error:message }, { status });
  }
}
