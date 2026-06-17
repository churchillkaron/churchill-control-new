import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function makeInvoiceNumber() {
  return `AVQ-${Date.now()}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function generateOrganizationInvoice({
  organizationId,
  billingCycle = "monthly",
}) {

  const { data: organization, error: orgError } =
    await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

  if (orgError || !organization) {
    return {
      success: false,
      error: "Organization not found",
    };
  }

  // GET OWNER EMAIL
  const { data: ownerMembership } =
    await supabaseAdmin
      .from("organization_users")
      .select("staff_account_id")
      .eq("organization_id", organizationId)
      .eq("role", "OWNER")
      .maybeSingle();

  let email = null;

  if (ownerMembership?.staff_account_id) {

    const { data: ownerStaff } =
      await supabaseAdmin
        .from("staff_accounts")
        .select("email")
        .eq("id", ownerMembership.staff_account_id)
        .maybeSingle();

    email = ownerStaff?.email || null;

  }

  const { data: modules } =
    await supabaseAdmin
      .from("organization_modules")
      .select("module_id")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE");

  const moduleIds =
    (modules || []).map(m => m.module_id);

  const { data: pricing } =
    await supabaseAdmin
      .from("platform_module_pricing")
      .select("*")
      .in("module_id", moduleIds)
      .eq("active", true);

  const amount =
    (pricing || []).reduce(
      (sum, row) =>
        sum +
        Number(
          billingCycle === "yearly"
            ? row.yearly_price
            : row.monthly_price
        ),
      0
    );

  const { data: invoice, error } =
    await supabaseAdmin
      .from("billing_invoices")
      .insert({
        organization_id: organization.id,
        tenant_id: organization.tenant_id,
        company: organization.name,
        email,
        invoice_number: makeInvoiceNumber(),
        currency: "THB",
        amount,
        status: "issued",
        due_date: addDays(new Date(), 7),
      })
      .select()
      .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    invoice,
  };
}
