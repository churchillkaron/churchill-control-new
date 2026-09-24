import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

export default async function resolveStaffPartyForOrganization({
  staff,
  organizationId,
} = {}) {
  const staffId = text(staff?.id);
  const organization = text(organizationId);
  if (!staffId || !organization) return null;

  if (staff?.party_id) {
    const current = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,status")
      .eq("id", staff.party_id)
      .maybeSingle();

    if (current.error) throw current.error;
    if (
      text(current.data?.organization_id) === organization &&
      text(current.data?.status).toUpperCase() === "ACTIVE"
    ) {
      return current.data.id;
    }
  }

  const assignments = await supabaseAdmin
    .from("employee_employment_assignments")
    .select("party_id,effective_from,effective_to,status")
    .eq("organization_id", organization)
    .eq("staff_account_id", staffId)
    .neq("status", "CANCELLED")
    .order("effective_from", { ascending: false })
    .limit(2);

  if (assignments.error) throw assignments.error;

  const assignmentPartyIds = [
    ...new Set(
      (assignments.data || [])
        .map((row) => text(row.party_id))
        .filter(Boolean),
    ),
  ];

  if (assignmentPartyIds.length > 1) {
    throw new Error("Multiple employment Party identities exist for this Staff account");
  }
  if (assignmentPartyIds.length === 1) return assignmentPartyIds[0];

  const email = text(staff?.email);
  if (!email) return null;

  const parties = await supabaseAdmin
    .from("parties")
    .select("id")
    .eq("organization_id", organization)
    .ilike("status", "active")
    .ilike("email", email)
    .limit(2);

  if (parties.error) throw parties.error;
  if ((parties.data || []).length > 1) {
    throw new Error("Multiple Party identities match this Staff email in the selected organization");
  }

  return parties.data?.[0]?.id || null;
}
