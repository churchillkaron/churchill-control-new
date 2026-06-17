import { loadAccountingClients } from "@/lib/accounting/loadAccountingClients";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadAccessibleAccountingClients({
  organizationId,
  userEmail,
}) {
  const clients =
    await loadAccountingClients({
      organizationId,
    });

  const {
    data: staff,
    error,
  } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("email", userEmail)
    .single();

  if (error || !staff) {
    throw new Error(
      "Staff account not found"
    );
  }

  const role =
    String(
      staff.role || ""
    ).toUpperCase();

  const isFirmAdmin =
    [
      "OWNER",
      "PARTNER",
      "SUPER_ADMIN",
      "ADMIN",
    ].includes(role);

  if (isFirmAdmin) {
    return {
      staff,
      clients,
    };
  }

  const filtered =
    clients.filter(client => {

      const profile =
        client.profile || {};

      return (
        profile.assigned_accountant_id ===
          staff.id ||

        profile.assigned_reviewer_id ===
          staff.id
      );

    });

  return {
    staff,
    clients: filtered,
  };
}
