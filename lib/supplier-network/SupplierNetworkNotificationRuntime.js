import "@/lib/platform/service-runtime/providers/email/EmailCredentialRegistration.js";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { loadProviderRuntime } from "@/lib/platform/service-runtime/providers/ProviderExecutor";

const EMAIL_PROVIDERS = Object.freeze(["email_google","email_microsoft","email_imap"]);

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function appOrigin() {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://avantiqo.ai"
    ).origin;
  } catch {
    return "https://avantiqo.ai";
  }
}

async function resolveEmailProvider(organizationId) {
  for (const provider of EMAIL_PROVIDERS) {
    try {
      const credential = await resolveProviderCredential({ organization_id: organizationId, provider });
      if (credential) return { provider, credential };
    } catch {}
  }
  return null;
}

export async function deliverSupplierConnectionRequestEmail({
  organizationId,
  recipient,
  buyerName,
  supplierName,
  buyerNote = "",
} = {}) {
  const orgId = clean(organizationId, 100);
  const email = clean(recipient, 320).toLowerCase();
  if (!orgId || !email) {
    return { sent: false, status: "SKIPPED", reason: "INPUT_REQUIRED" };
  }
  if (email.endsWith(".invalid") || email.includes("@example.invalid")) {
    return { sent: false, status: "SKIPPED_TEST_ADDRESS", reason: "RESERVED_TEST_ADDRESS" };
  }

  const selected = await resolveEmailProvider(orgId);
  if (!selected) {
    return { sent: false, status: "MANUAL_REQUIRED", reason: "NO_ORGANIZATION_EMAIL_PROVIDER" };
  }

  const buyer = clean(buyerName, 180) || "An Avantiqo business";
  const supplier = clean(supplierName, 180) || "your supplier business";
  const note = clean(buyerNote, 1200);
  const portalUrl = appOrigin() + "/supplier-portal";

  try {
    const runtime = await loadProviderRuntime(selected.provider);
    const result = await runtime.execute({
      capability: "communication.email.send",
      recipient: email,
      subject: buyer + " wants to connect with " + supplier + " on Avantiqo",
      message:
        "Hello,\n\n" +
        buyer +
        " has requested a Supplier Network connection with " +
        supplier +
        "." +
        (note ? "\n\nBuyer note:\n" + note : "") +
        "\n\nOpen Supplier Portal to review the request:\n" +
        portalUrl +
        "\n\nAccepting the connection creates only the governed customer-supplier relationship. It does not create staff access or expose any other customer relationships.",
      ...selected.credential,
      credential: selected.credential,
      context: {
        organization_id: orgId,
        credential_id: selected.credential.credential_id || null,
        execution_purpose: "SUPPLIER_NETWORK_CONNECTION_REQUEST_EMAIL",
        billable: false,
      },
    });
    return {
      sent: result?.success === true,
      status: result?.success === true ? "SENT" : "DELIVERY_FAILED",
      provider: selected.provider,
      reason: result?.success === true ? null : "EMAIL_PROVIDER_DID_NOT_CONFIRM_SEND",
    };
  } catch (error) {
    return {
      sent: false,
      status: "DELIVERY_FAILED",
      provider: selected.provider,
      reason: clean(error?.message || error, 500),
    };
  }
}

export async function deliverSupplierConnectionResponseEmail({
  organizationId,
  recipient,
  supplierName,
  action,
  supplierNote = "",
} = {}) {
  const orgId = clean(organizationId, 100);
  const email = clean(recipient, 320).toLowerCase();
  const normalizedAction = clean(action, 20).toUpperCase();
  if (!orgId || !email || !["ACCEPTED","DECLINED"].includes(normalizedAction)) {
    return { sent: false, status: "SKIPPED", reason: "INPUT_REQUIRED" };
  }
  if (email.endsWith(".invalid") || email.includes("@example.invalid")) {
    return { sent: false, status: "SKIPPED_TEST_ADDRESS", reason: "RESERVED_TEST_ADDRESS" };
  }

  const selected = await resolveEmailProvider(orgId);
  if (!selected) {
    return { sent: false, status: "MANUAL_REQUIRED", reason: "NO_ORGANIZATION_EMAIL_PROVIDER" };
  }

  const supplier = clean(supplierName, 180) || "The supplier";
  const note = clean(supplierNote, 1200);
  const accepted = normalizedAction === "ACCEPTED";
  const networkUrl = appOrigin() + "/workspace/" + encodeURIComponent(orgId) + "/procurement/supplier-network";

  try {
    const runtime = await loadProviderRuntime(selected.provider);
    const result = await runtime.execute({
      capability: "communication.email.send",
      recipient: email,
      subject: supplier + (accepted ? " accepted" : " declined") + " your Avantiqo Supplier Network request",
      message:
        "Hello,\n\n" +
        supplier +
        (accepted
          ? " accepted your Supplier Network connection request."
          : " declined your Supplier Network connection request.") +
        (note ? "\n\nSupplier note:\n" + note : "") +
        (accepted
          ? "\n\nThe governed supplier relationship is now connected. You can view the supplier shop, your negotiated terms and create purchase orders from Supplier Network."
          : "\n\nNo supplier relationship was created.") +
        "\n\nOpen Supplier Network:\n" +
        networkUrl,
      ...selected.credential,
      credential: selected.credential,
      context: {
        organization_id: orgId,
        credential_id: selected.credential.credential_id || null,
        execution_purpose: "SUPPLIER_NETWORK_CONNECTION_RESPONSE_EMAIL",
        billable: false,
      },
    });

    return {
      sent: result?.success === true,
      status: result?.success === true ? "SENT" : "DELIVERY_FAILED",
      provider: selected.provider,
      reason: result?.success === true ? null : "EMAIL_PROVIDER_DID_NOT_CONFIRM_SEND",
    };
  } catch (error) {
    return {
      sent: false,
      status: "DELIVERY_FAILED",
      provider: selected.provider,
      reason: clean(error?.message || error, 500),
    };
  }
}
