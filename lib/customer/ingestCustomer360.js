import { supabaseAdmin } from "../shared/supabase/admin.js";

async function upsertCustomer(tenantId, source, sourceId, firstName, lastName, email, phone) {
  const { data: existing } = await supabaseAdmin
    .from("customer_loyalty_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source", source)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("customer_loyalty_accounts")
    .insert({
      tenant_id: tenantId,
      source,
      source_id: sourceId,
      customer_name: `${firstName || ""} ${lastName || ""}`.trim(),
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      loyalty_points: 0,
      total_spent: 0,
      visit_count: 0,
      tier: "REGULAR",
      last_visit_at: new Date().toISOString()
    })
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function ingestCustomer360({ tenantId }) {
  if (!tenantId) throw new Error("tenantId required");

  const [hotelGuests, healthcarePatients, accountingClients] = await Promise.all([
    supabaseAdmin.from("hotel_guests").select("*").eq("organization_id", tenantId),
    supabaseAdmin.from("healthcare_patients").select("*").eq("organization_id", tenantId),
    supabaseAdmin.from("accounting_client_profiles").select("*").eq("firm_organization_id", tenantId),
  ]);

  const allCustomers = [];

  for (const h of hotelGuests.data || []) {
    const customer = await upsertCustomer(tenantId, "hotel", h.id, h.first_name, h.last_name, h.email, h.phone);
    allCustomers.push(customer);
    await supabaseAdmin.from("customer_events").insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      event_type: "booking",
      source_type: "hotel",
      source_id: h.id,
      event_date: h.created_at,
      metadata: { room_id: h.room_id },
    });
  }

  for (const p of healthcarePatients.data || []) {
    const customer = await upsertCustomer(tenantId, "healthcare", p.id, p.first_name, p.last_name, p.email, p.phone);
    allCustomers.push(customer);
    await supabaseAdmin.from("customer_events").insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      event_type: "appointment",
      source_type: "healthcare",
      source_id: p.id,
      event_date: p.created_at,
      metadata: {},
    });
  }

  for (const c of accountingClients.data || []) {
    const customer = await upsertCustomer(tenantId, "accounting", c.client_organization_id, null, null, null, null);
    allCustomers.push(customer);
    await supabaseAdmin.from("customer_events").insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      event_type: "accounting_client",
      source_type: "accounting",
      source_id: c.client_organization_id,
      event_date: c.created_at,
      metadata: { relationship_status: c.relationship_status },
    });
  }

  return { success: true, ingested: allCustomers.length };
}
