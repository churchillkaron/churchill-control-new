import crypto from "node:crypto";
import { consumeBusinessPartnerExternalEvent } from "./BusinessPartnerExternalWaitRuntime";

export const BUSINESS_PARTNER_BUSINESS_EVENT_ADAPTER_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_BUSINESS_EVENT_ADAPTER_V1";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function eventId({ organizationId, source, type, identity }) {
  return crypto
    .createHash("sha256")
    .update([organizationId, source, type, identity].join("|"))
    .digest("hex");
}

export async function emitBusinessPartnerBusinessEvent({
  organization_id,
  event_source,
  event_type,
  correlations = [],
  event_id = null,
  identity = null,
  evidence = {},
} = {}) {
  const organizationId = text(organization_id, 160);
  const source = text(event_source, 120);
  const type = text(event_type, 180);
  const keys = [...new Set((Array.isArray(correlations) ? correlations : [])
    .map((value) => text(value, 500))
    .filter(Boolean))];
  if (!organizationId || !source || !type || !keys.length) {
    return { success: true, matched: 0, skipped: true, authorization_effect: "NONE" };
  }

  const immutableEventId =
    text(event_id, 240) ||
    eventId({ organizationId, source, type, identity: text(identity, 600) || keys.join("|") });
  let matched = 0;
  const resumptions = [];
  for (const correlationKey of keys) {
    const result = await consumeBusinessPartnerExternalEvent({
      organization_id: organizationId,
      event_source: source,
      event_type: type,
      correlation_key: correlationKey,
      event_id: immutableEventId,
      evidence: {
        ...object(evidence),
        adapter_contract: BUSINESS_PARTNER_BUSINESS_EVENT_ADAPTER_CONTRACT,
        correlation_key: correlationKey,
        authorization_effect: "NONE",
      },
    });
    matched += Number(result?.matched || 0);
    resumptions.push(...(Array.isArray(result?.resumptions) ? result.resumptions : []));
  }
  return {
    success: true,
    event_id: immutableEventId,
    matched,
    resumptions,
    authorization_effect: "NONE",
  };
}

export const BusinessPartnerBusinessEventAdapterRuntime = Object.freeze({
  contract: BUSINESS_PARTNER_BUSINESS_EVENT_ADAPTER_CONTRACT,
  emit: emitBusinessPartnerBusinessEvent,
});
