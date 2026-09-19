import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getCustomer, upsertCustomerParty } from "@/lib/commercial/customers/CustomerService";
import { createServicePlan, generateNextServiceVisit } from "@/lib/service-management/runtime/ServicePlanRuntime";
import { listServiceExecutionTemplates } from "@/lib/service-management/repositories/ServiceExecutionTemplateRepository";
import { createCustomerPortalAccessLink, ensurePortalBookingPaymentRequest } from "@/lib/customer-portal/CustomerPortalRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sourceKey({ requestId, callId, type }) {
  const source = requestId ? `message:${requestId}` : `call:${callId}`;
  return `${source}:${type}`;
}

function evidenceHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function existingAgreement(organizationId, key) {
  return one(
    supabaseAdmin.from("business_agreement_executions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source_key", key)
      .maybeSingle(),
  );
}

async function ensureResolutionTask({ organizationId, contactPartyId, key, facts, missing }) {
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .contains("metadata", { business_agreement_source_key: key })
      .maybeSingle(),
  );
  if (existing?.id) return existing;

  const created = await supabaseAdmin.from("secretary_tasks").insert({
    organization_id: organizationId,
    contact_party_id: contactPartyId || null,
    title: "Resolve confirmed customer booking",
    details: `Customer agreement is understood but canonical execution is blocked by: ${missing.join(", ")}.`,
    status: "OPEN",
    priority: "HIGH",
    source: "business_agreement_execution",
    metadata: {
      business_agreement_source_key: key,
      agreement_type: "PEST_CONTROL_SERVICE_BOOKING",
      missing_facts: missing,
      normalized_facts: facts,
      execution_ready: false,
    },
  }).select("*").single();

  if (created.error?.code === "23505") {
    return one(
      supabaseAdmin.from("secretary_tasks")
        .select("*")
        .eq("organization_id", organizationId)
        .contains("metadata", { business_agreement_source_key: key })
        .maybeSingle(),
    );
  }
  if (created.error) throw created.error;
  return created.data;
}

async function completeResolutionTask({ organizationId, key, executionResult }) {
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .contains("metadata", { business_agreement_source_key: key })
      .maybeSingle(),
  );
  if (!existing?.id || existing.status === "COMPLETED") return existing || null;
  const updated = await supabaseAdmin.from("secretary_tasks").update({
    status: "COMPLETED",
    completed_at: new Date().toISOString(),
    metadata: {
      ...object(existing.metadata),
      execution_ready: true,
      execution_result: executionResult,
    },
    updated_at: new Date().toISOString(),
  }).eq("id", existing.id).select("*").single();
  if (updated.error) throw updated.error;
  return updated.data;
}

async function persistAgreement({ organizationId, key, sourceKind, sourceId, conversationId, contactPartyId, status, facts, missing, evidence, result = {}, error = null }) {
  const row = {
    organization_id: organizationId,
    source_key: key,
    source_kind: sourceKind,
    source_id: sourceId || null,
    conversation_id: conversationId || null,
    contact_party_id: contactPartyId || null,
    agreement_type: "PEST_CONTROL_SERVICE_BOOKING",
    status,
    target_capability: "operations.work-orders.create",
    target_action: "CREATE_SERVICE_VISIT",
    normalized_facts: facts,
    missing_facts: missing,
    evidence: { ...evidence, evidence_hash: evidenceHash(evidence) },
    execution_result: result,
    last_error: error ? text(error?.message || error, 2000) : null,
    executed_at: status === "EXECUTED" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const saved = await supabaseAdmin.from("business_agreement_executions")
    .upsert(row, { onConflict: "organization_id,source_key" })
    .select("*")
    .single();
  if (saved.error) throw saved.error;
  return saved.data;
}

function normalizedBookingType(decision = {}) {
  return text(decision.business_booking_type, 80).toUpperCase();
}

export async function loadSecretaryBusinessBookingContext({ organizationId, contactPartyId }) {
  const [templates, plans, party] = await Promise.all([
    listServiceExecutionTemplates({ organizationId, industryKey: "pest_control", status: "active", limit: 50 }),
    contactPartyId
      ? supabaseAdmin.from("service_plans")
          .select("customer_location_name,service_name,status")
          .eq("organization_id", organizationId)
          .eq("customer_party_id", contactPartyId)
          .order("updated_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    contactPartyId
      ? supabaseAdmin.from("parties")
          .select("display_name,phone,email,address")
          .eq("organization_id", organizationId)
          .eq("id", contactPartyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (plans?.error) throw plans.error;
  if (party?.error) throw party.error;
  return {
    supported_business_booking_types: templates.length ? ["PEST_CONTROL_SERVICE"] : [],
    known_customer_identity: {
      name: text(party?.data?.display_name, 500) || null,
      phone: text(party?.data?.phone, 500) || null,
      email: text(party?.data?.email, 500) || null,
      address: text(party?.data?.address, 1000) || null,
    },
    pest_control: {
      active_protocols: templates.map((row) => ({ code: row.code, name: row.name })),
      known_customer_sites: [...new Set((plans.data || []).map((row) => text(row.customer_location_name, 500)).filter(Boolean))].slice(0, 10),
      recent_services: [...new Set((plans.data || []).map((row) => text(row.service_name, 500)).filter(Boolean))].slice(0, 10),
    },
  };
}

async function persistMessageCustomerFacts({
  organizationId,
  contactPartyId,
  customerName,
  customerPhone,
  customerAddress,
}) {
  if (!contactPartyId) return null;
  const current = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,phone,address")
      .eq("organization_id", organizationId)
      .eq("id", contactPartyId)
      .maybeSingle(),
  );
  if (!current?.id) return null;
  const patch = {
    display_name: text(customerName, 500) || current.display_name,
    phone: text(customerPhone, 500) || current.phone || null,
    address: text(customerAddress, 1000) || current.address || null,
    updated_at: new Date().toISOString(),
  };
  const saved = await supabaseAdmin.from("parties")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", contactPartyId)
    .select("id,display_name,phone,address")
    .single();
  if (saved.error) throw saved.error;
  return saved.data;
}

async function promoteContactToCustomer({ organizationId, contactPartyId }) {
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,party_type,display_name,email,phone,legal_name,tax_id,address,status")
      .eq("organization_id", organizationId)
      .eq("id", contactPartyId)
      .maybeSingle(),
  );
  if (!party?.id || !text(party.display_name, 500)) {
    throw new Error("Canonical contact party is unavailable for customer promotion.");
  }
  const promoted = await upsertCustomerParty({
    organizationId,
    access: {},
    body: {
      party_id: party.id,
      party_type: party.party_type,
      display_name: party.display_name,
      email: party.email,
      phone: party.phone,
      legal_name: party.legal_name,
      tax_id: party.tax_id,
      address: party.address,
      marketing_opt_in: false,
      notes: "Customer relationship activated from an explicit confirmed service booking.",
    },
  });
  return promoted.customer || getCustomer({ organizationId, partyId: contactPartyId });
}

function resolveTemplate(templates, decision) {
  const requested = text(decision.service_protocol, 500).toLowerCase();
  if (requested) {
    const matches = templates.filter((row) =>
      [row.code, row.name].some((value) => text(value, 500).toLowerCase() === requested),
    );
    if (matches.length === 1) return matches[0];
  }
  return templates.length === 1 ? templates[0] : null;
}

export async function executeSecretaryBusinessAgreement({
  organizationId,
  entityId = null,
  contactPartyId,
  conversationId = null,
  requestId = null,
  callId = null,
  decision = {},
  appointment = null,
  bookingPolicy = {},
} = {}) {
  if (normalizedBookingType(decision) !== "PEST_CONTROL_SERVICE") return { status: "not_applicable" };
  const key = sourceKey({ requestId, callId, type: "pest-control-service-booking" });
  const prior = await existingAgreement(organizationId, key);
  if (prior?.status === "EXECUTED") return { status: "executed", replayed: true, record: prior, result: prior.execution_result };

  const startsAt = text(decision.starts_at, 120);
  const location = text(decision.location, 1000);
  const serviceName = text(decision.service_name || decision.appointment_title, 500);
  const customerName = text(decision.customer_name, 500);
  const customerPhone = text(decision.customer_phone, 500);
  const customerAddress = text(decision.customer_address || decision.location, 1000);
  const explicit = decision.business_agreement_explicit === true;
  const billingAmount = Number(decision.billing_amount);
  const billingCurrencyCode = text(decision.billing_currency_code, 20).toUpperCase();
  const billable = Number.isFinite(billingAmount) && billingAmount > 0 && Boolean(billingCurrencyCode);
  let customer = contactPartyId ? await getCustomer({ organizationId, partyId: contactPartyId }) : null;
  const templates = await listServiceExecutionTemplates({ organizationId, entityId, industryKey: "pest_control", status: "active", limit: 50 });
  const template = resolveTemplate(templates, decision);
  const confirmed = text(appointment?.status, 40).toUpperCase() === "CONFIRMED" && bookingPolicy.require_internal_confirmation !== true;

  const missing = [
    !explicit ? "explicit_customer_agreement" : null,
    !contactPartyId ? "contact_party_id" : null,
    !customerName ? "customer_name" : null,
    !customerPhone ? "customer_phone" : null,
    !customerAddress ? "customer_address" : null,
    !startsAt || !Number.isFinite(Date.parse(startsAt)) ? "scheduled_start" : null,
    !location ? "customer_site" : null,
    !serviceName ? "service_name" : null,
    !template ? "exact_active_treatment_protocol" : null,
    !confirmed ? "booking_confirmation_authority" : null,
  ].filter(Boolean);

  if (!missing.length && contactPartyId) {
    await persistMessageCustomerFacts({
      organizationId,
      contactPartyId,
      customerName,
      customerPhone,
      customerAddress,
    });
    customer = await getCustomer({ organizationId, partyId: contactPartyId });
  }

  if (!missing.length && !customer && contactPartyId) {
    try {
      customer = await promoteContactToCustomer({ organizationId, contactPartyId });
    } catch {
      customer = null;
    }
  }
  if (!customer) missing.push("canonical_customer_relationship");

  const facts = {
    customer_party_id: contactPartyId || null,
    customer_name: customerName || null,
    customer_phone: customerPhone || null,
    customer_address: customerAddress || null,
    scheduled_start: startsAt || null,
    location: location || null,
    service_name: serviceName || null,
    service_protocol: template ? { id: template.id, code: template.code, name: template.name } : null,
    calendar_event_id: appointment?.id || null,
    calendar_status: appointment?.status || null,
  };
  const evidence = {
    source_kind: requestId ? "MESSAGE" : "CALL",
    source_id: requestId || callId || null,
    decision_action: decision.action || null,
    business_booking_type: normalizedBookingType(decision),
    explicit_customer_agreement: explicit,
  };

  if (missing.length) {
    const record = await persistAgreement({
      organizationId, key, sourceKind: evidence.source_kind, sourceId: requestId || callId,
      conversationId, contactPartyId, status: "BLOCKED", facts, missing, evidence,
    });
    const resolutionTask = await ensureResolutionTask({
      organizationId,
      contactPartyId,
      key,
      facts,
      missing,
    });
    return { status: "blocked", missing_facts: missing, record, resolution_task_id: resolutionTask?.id || null };
  }

  await persistAgreement({
    organizationId, key, sourceKind: evidence.source_kind, sourceId: requestId || callId,
    conversationId, contactPartyId, status: "EXECUTING", facts, missing: [], evidence,
  });

  try {
    const context = {
      organization_id: organizationId,
      entity_id: entityId || template.entity_id || null,
      actor_id: null,
      role: "SYSTEM_AUTOMATION",
      permissions: ["operations.*"],
    };
    const plan = await createServicePlan({
      context,
      input: {
        customer_party_id: contactPartyId,
        customer_location_name: location,
        service_name: serviceName,
        service_category: "pest_control",
        industry_key: "pest_control",
        execution_template_id: template.id,
        first_service_at: new Date(startsAt).toISOString(),
        contract_start: new Date(startsAt).toISOString(),
        contract_end: new Date(startsAt).toISOString(),
        duration_minutes: Math.max(15, Number(decision.duration_minutes || bookingPolicy.appointment_duration_minutes || 60)),
        recurrence: { preset: "monthly" },
        billing: billable
          ? { mode: "prepaid", amount: billingAmount, currency_code: billingCurrencyCode }
          : { mode: "none" },
        notes: `Created from explicit Secretary customer booking agreement ${key}.`,
      },
    });
    const visit = await generateNextServiceVisit({ context, planId: plan.id });
    const servicePlanId = visit.plan?.id || plan.id;
    const portalPayment = billable
      ? await ensurePortalBookingPaymentRequest({
          organizationId,
          entityId: context.entity_id,
          partyId: contactPartyId,
          bookingId: servicePlanId,
          description: serviceName,
          amount: billingAmount,
          currencyCode: billingCurrencyCode,
        })
      : null;
    const portalAccess = await createCustomerPortalAccessLink({
      organizationId,
      partyId: contactPartyId,
      sourceType: "SERVICE_BOOKING",
      sourceId: servicePlanId,
    });
    const result = {
      service_plan_id: servicePlanId,
      occurrence_id: visit.occurrence?.id || null,
      work_order_id: visit.work_order?.id || null,
      scheduled_start: startsAt,
      payment_request_id: portalPayment?.id || null,
      portal_access: portalAccess,
    };
    const record = await persistAgreement({
      organizationId, key, sourceKind: evidence.source_kind, sourceId: requestId || callId,
      conversationId, contactPartyId, status: "EXECUTED", facts, missing: [], evidence, result,
    });
    await completeResolutionTask({ organizationId, key, executionResult: result });
    return { status: "executed", replayed: false, record, result };
  } catch (error) {
    const record = await persistAgreement({
      organizationId, key, sourceKind: evidence.source_kind, sourceId: requestId || callId,
      conversationId, contactPartyId, status: "FAILED", facts, missing: [], evidence, error,
    });
    return { status: "failed", error: text(error?.message || error, 1000), record };
  }
}

export default {
  loadSecretaryBusinessBookingContext,
  executeSecretaryBusinessAgreement,
};
