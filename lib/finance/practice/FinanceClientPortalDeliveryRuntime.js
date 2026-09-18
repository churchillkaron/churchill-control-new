import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EMAIL_PROVIDERS = ["email_google", "email_microsoft", "email_imap"];
const PURPOSE_BY_PROVIDER = {
  email_google: "ORGANIZATION_GOOGLE_MAILBOX",
  email_microsoft: "ORGANIZATION_MICROSOFT_MAILBOX",
  email_imap: "ORGANIZATION_IMAP_SMTP_MAILBOX",
};
const text = (value) => String(value ?? "").trim();
const now = () => new Date().toISOString();

async function activeEmailCredential(accountingFirmId) {
  const { data, error } = await supabaseAdmin.from("provider_credentials")
    .select("id,provider_id,status,metadata,created_at,updated_at")
    .in("provider_id", EMAIL_PROVIDERS)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).find((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return text(metadata.organization_id) === text(accountingFirmId)
      && text(metadata.purpose).toUpperCase() === PURPOSE_BY_PROVIDER[row.provider_id]
      && metadata.enabled !== false;
  }) || null;
}

async function upsertDelivery({ grant, recipientEmail, providerId = null, status, subject, errorCode = null, errorMessage = null, metadata = {} }) {
  const { data, error } = await supabaseAdmin.from("finance_client_portal_deliveries").upsert({
    accounting_firm_id: grant.accounting_firm_id,
    organization_id: grant.organization_id,
    entity_id: grant.entity_id || null,
    engagement_id: grant.engagement_id,
    portal_grant_id: grant.id,
    recipient_email: recipientEmail,
    channel: "EMAIL",
    provider_id: providerId,
    status,
    subject,
    error_code: errorCode,
    error_message: errorMessage,
    metadata,
    updated_at: now(),
  }, { onConflict: "portal_grant_id,recipient_email" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function getFinanceClientPortalDeliveryReadiness({ accountingFirmId } = {}) {
  if (!accountingFirmId) throw new Error("accountingFirmId required");
  const credential = await activeEmailCredential(accountingFirmId);
  return {
    ready: Boolean(credential),
    provider_id: credential?.provider_id || null,
    credential_id: credential?.id || null,
    blocker: credential ? null : "EMAIL_PROVIDER_CREDENTIAL_REQUIRED",
  };
}

export async function deliverFinanceClientPortalAccess({ grant, rawPortalUrl, firmName = "Accounting team" } = {}) {
  if (!grant?.id) throw new Error("Portal grant required");
  const recipientEmail = text(grant.client_email).toLowerCase();
  if (!recipientEmail) throw new Error("Client email required for portal delivery");
  const portalUrl = text(rawPortalUrl);
  if (!portalUrl) throw new Error("Portal URL required for delivery");
  const subject = `${text(firmName) || "Accounting team"} · secure client portal`;
  const readiness = await getFinanceClientPortalDeliveryReadiness({ accountingFirmId: grant.accounting_firm_id });
  if (!readiness.ready) {
    const delivery = await upsertDelivery({
      grant, recipientEmail, status: "CREDENTIAL_REQUIRED", subject,
      errorCode: "EMAIL_PROVIDER_CREDENTIAL_REQUIRED",
      errorMessage: "Install an organization email provider before Avantiqo can deliver client portal access automatically.",
      metadata: { portal_scope: grant.entity_id ? "ENTITY" : "ORGANIZATION", general_erp_access: false },
    });
    return { success: false, delivered: false, readiness, delivery };
  }

  let delivery = await upsertDelivery({
    grant, recipientEmail, providerId: readiness.provider_id, status: "SENDING", subject,
    metadata: { portal_scope: grant.entity_id ? "ENTITY" : "ORGANIZATION", general_erp_access: false },
  });
  const wallet = await WalletRepository.getByOrganization(grant.accounting_firm_id);
  const currency = text(wallet?.currency || wallet?.default_currency);
  if (!currency) {
    delivery = await upsertDelivery({
      grant, recipientEmail, providerId: readiness.provider_id, status: "FAILED", subject,
      errorCode: "ORGANIZATION_WALLET_CURRENCY_REQUIRED",
      errorMessage: "Organization wallet currency is required before email delivery can execute.",
    });
    return { success: false, delivered: false, readiness, delivery };
  }

  try {
    const result = await executeService({
      organization_id: grant.accounting_firm_id,
      party_id: null,
      service_id: "email",
      provider_id: readiness.provider_id,
      capability: "communication.email.send",
      currency,
      input: {
        recipient: recipientEmail,
        subject,
        message: [
          `Hello${grant.client_name ? ` ${grant.client_name}` : ""},`,
          "",
          `${text(firmName) || "Your accounting team"} has created secure accounting-portal access for you.`,
          "Use this private link to review requests, documents, invoices and signature items that belong to this engagement:",
          "",
          portalUrl,
          "",
          `This access expires ${new Date(grant.expires_at).toISOString().slice(0, 10)} and can be revoked at any time.`,
          "Do not forward this link.",
        ].join("\n"),
        attachments: [],
        quantity: 1,
        currency,
      },
      metadata: {
        source: "FINANCE_CLIENT_PORTAL_DELIVERY",
        portal_grant_id: grant.id,
        engagement_id: grant.engagement_id,
        recipient_email: recipientEmail,
      },
    });
    const output = result?.output?.output || result?.output || {};
    const externalMessageId = output?.id || output?.message_id || output?.messages?.[0]?.id || null;
    const { data, error } = await supabaseAdmin.from("finance_client_portal_deliveries").update({
      status: "SENT",
      provider_id: readiness.provider_id,
      external_message_id: externalMessageId,
      attempt_count: Number(delivery.attempt_count || 0) + 1,
      error_code: null,
      error_message: null,
      sent_at: now(),
      updated_at: now(),
      metadata: { ...(delivery.metadata || {}), usage_id: result?.usage?.id || null, provider_output_received: true },
    }).eq("id", delivery.id).select("*").single();
    if (error) throw error;
    return { success: true, delivered: true, readiness, delivery: data };
  } catch (error) {
    const { data } = await supabaseAdmin.from("finance_client_portal_deliveries").update({
      status: "FAILED",
      provider_id: readiness.provider_id,
      attempt_count: Number(delivery.attempt_count || 0) + 1,
      error_code: text(error?.code) || "PORTAL_EMAIL_DELIVERY_FAILED",
      error_message: text(error?.message).slice(0, 1000) || "Portal email delivery failed",
      updated_at: now(),
    }).eq("id", delivery.id).select("*").single();
    return { success: false, delivered: false, readiness, delivery: data || delivery };
  }
}
