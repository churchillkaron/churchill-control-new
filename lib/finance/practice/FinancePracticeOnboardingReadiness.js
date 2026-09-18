function clean(value) {
  return String(value ?? "").trim();
}

export function evaluatePracticeEngagementReadiness({
  engagement,
  link,
  document,
  signatures = [],
  billingProfile,
}) {
  if (!engagement?.entity_id) return { state: "NEEDS_ENTITY", next_action: "Set the client legal entity before accounting work starts." };
  if (!link || !document) return { state: "NEEDS_ENGAGEMENT_LETTER", next_action: "Link the approved engagement letter or contract." };
  if (!document.approved_at && !["approved", "active"].includes(clean(document.document_status).toLowerCase())) {
    return { state: "NEEDS_DOCUMENT_APPROVAL", next_action: "Approve the current engagement document version." };
  }
  if (!signatures.length) return { state: "NEEDS_SIGNATURE_REQUEST", next_action: "Choose the real signer and request signature." };
  if (signatures.some((row) => row.status === "DECLINED")) return { state: "SIGNATURE_DECLINED", next_action: "Resolve the declined engagement signature before starting recurring work." };
  if (!signatures.some((row) => row.status === "SIGNED")) return { state: "AWAITING_SIGNATURE", next_action: "Wait for the engagement signature or follow up deliberately." };
  if (!billingProfile) return { state: "NEEDS_BILLING_POLICY", next_action: "Set the engagement billing method and commercial terms." };
  return { state: "READY", next_action: "Engagement setup is complete. Recurring accounting work can proceed." };
}
