import "@/lib/platform/service-runtime/providers/email/EmailCredentialRegistration.js";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { loadProviderRuntime } from "@/lib/platform/service-runtime/providers/ProviderExecutor";

export const INVITATION_EMAIL_DELIVERY_CONTRACT = "AVANTIQO_INVITATION_EMAIL_DELIVERY_V1";
const EMAIL_PROVIDERS = Object.freeze(["email_google", "email_microsoft", "email_imap"]);

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function reservedTestAddress(email) {
  const value = text(email, 320).toLowerCase();
  return value.endsWith(".invalid") || value.includes("@example.invalid");
}

async function availableEmailProvider(organizationId) {
  for (const provider of EMAIL_PROVIDERS) {
    try {
      const credential = await resolveProviderCredential({ organization_id: organizationId, provider });
      if (credential) return { provider, credential };
    } catch (error) {
      console.error("INVITATION_EMAIL_CREDENTIAL_RESOLUTION_FAILED", {
        provider,
        organizationId,
        error: text(error?.message || error, 500),
      });
    }
  }
  return null;
}

function messageFor({ kind, sourceName, recipientName, inviteUrl, expiresAt, role, permissions, billingModel }) {
  const source = text(sourceName, 180) || "An Avantiqo organization";
  const recipient = text(recipientName, 180);
  const greeting = recipient ? `Hello ${recipient},` : "Hello,";
  const expiry = expiresAt ? new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }) : null;
  const expiryLine = expiry ? `\nThis invitation expires ${expiry} (Thailand time).` : "";

  if (kind === "supplier") {
    return {
      subject: `${source} invited you to Avantiqo Supplier Portal`,
      message: `${greeting}\n\n${source} has invited you to access its Supplier Portal in Avantiqo. Accepting creates supplier-only access for this customer relationship and does not create internal staff or business-workspace membership. After acceptance you may stay invitation-only, create a free Supplier Shop, or later connect the same supplier profile to a full Avantiqo Business.\n\nOpen invitation:\n${inviteUrl}${expiryLine}\n\nUse the exact email address that received this invitation. If you were not expecting this invitation, you can ignore this message.`,
    };
  }
  if (kind === "developer") {
    const authority = [role ? `Role: ${role}` : null, permissions?.length ? `Permissions: ${permissions.join(", ")}` : null].filter(Boolean).join("\n");
    return {
      subject: `${source} invited you to Avantiqo Developer Portal`,
      message: `${greeting}\n\n${source} has invited you to its organization-scoped Developer Portal in Avantiqo. This access is separate from employee and normal business-workspace membership.${authority ? `\n\n${authority}` : ""}\n\nOpen invitation:\n${inviteUrl}${expiryLine}\n\nUse the exact email address that received this invitation. If you were not expecting this invitation, you can ignore this message.`,
    };
  }
  if (kind === "accounting_client") {
    const billing = billingModel === "client_pays" ? "Client-paid service relationship" : billingModel === "firm_pays" ? "Firm-paid service relationship" : null;
    return {
      subject: `${source} invited you to connect an organization in Avantiqo`,
      message: `${greeting}\n\n${source} has invited you to connect one organization you own or administer with their accounting firm in Avantiqo. The accounting firm cannot choose or claim your organization; you select the organization when accepting the invitation.${billing ? `\n\n${billing}.` : ""}\n\nOpen invitation:\n${inviteUrl}${expiryLine}\n\nUse the exact email address that received this invitation. If you were not expecting this invitation, you can ignore this message.`,
    };
  }
  if (kind === "accounting_managed_client_claim") {
    return {
      subject: `${source} invited you to activate your existing Avantiqo company`,
      message: `${greeting}\n\n${source} currently manages your company's accounting in Avantiqo. This invitation lets you claim that existing company as your own Avantiqo Business. Your current books, documents and accounting history stay in the same organization; Avantiqo does not create a duplicate company.\n\nOpen claim invitation:\n${inviteUrl}${expiryLine}\n\nUse the exact email address that received this invitation. If you were not expecting it, you can ignore this message.`,
    };
  }
  throw new Error(`INVITATION_EMAIL_KIND_UNSUPPORTED:${kind}`);
}

export async function deliverInvitationEmail({
  organizationId,
  kind,
  recipient,
  recipientName = null,
  sourceName = null,
  inviteUrl,
  expiresAt = null,
  role = null,
  permissions = [],
  billingModel = null,
} = {}) {
  const organization = text(organizationId, 100);
  const email = text(recipient, 320).toLowerCase();
  const url = text(inviteUrl, 3000);
  if (!organization || !email || !url) {
    return { contract: INVITATION_EMAIL_DELIVERY_CONTRACT, sent: false, status: "MANUAL_REQUIRED", reason: "INVITATION_DELIVERY_INPUT_REQUIRED" };
  }
  if (reservedTestAddress(email)) {
    return { contract: INVITATION_EMAIL_DELIVERY_CONTRACT, sent: false, status: "SKIPPED_TEST_ADDRESS", reason: "RESERVED_TEST_ADDRESS" };
  }

  const selected = await availableEmailProvider(organization);
  if (!selected) {
    return { contract: INVITATION_EMAIL_DELIVERY_CONTRACT, sent: false, status: "MANUAL_REQUIRED", reason: "NO_ORGANIZATION_EMAIL_PROVIDER" };
  }

  const content = messageFor({ kind, sourceName, recipientName, inviteUrl: url, expiresAt, role, permissions, billingModel });
  try {
    const runtime = await loadProviderRuntime(selected.provider);
    const result = await runtime.execute({
      capability: "communication.email.send",
      recipient: email,
      subject: content.subject,
      message: content.message,
      ...selected.credential,
      credential: selected.credential,
      context: {
        organization_id: organization,
        credential_id: selected.credential.credential_id || null,
        execution_purpose: "ACCESS_INVITATION_TRANSACTIONAL_EMAIL",
        billable: false,
      },
    });
    return {
      contract: INVITATION_EMAIL_DELIVERY_CONTRACT,
      sent: result?.success === true,
      status: result?.success === true ? "SENT" : "DELIVERY_FAILED",
      provider: selected.provider,
      reason: result?.success === true ? null : "EMAIL_PROVIDER_DID_NOT_CONFIRM_SEND",
    };
  } catch (error) {
    console.error("INVITATION_EMAIL_DELIVERY_FAILED", {
      organizationId: organization,
      kind,
      provider: selected.provider,
      error: text(error?.message || error, 600),
    });
    return {
      contract: INVITATION_EMAIL_DELIVERY_CONTRACT,
      sent: false,
      status: "DELIVERY_FAILED",
      provider: selected.provider,
      reason: text(error?.message || error, 500) || "INVITATION_EMAIL_DELIVERY_FAILED",
    };
  }
}

export const InvitationEmailDeliveryRuntime = Object.freeze({
  contract: INVITATION_EMAIL_DELIVERY_CONTRACT,
  deliver: deliverInvitationEmail,
});
