import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createDefaultRoles({
  tenant_id,
}) {

  const roles = [
    "owner",
    "admin",
    "manager",
    "accounting",
    "staff",
  ];

  const inserts =
    roles.map((role) => ({
      tenant_id,
      role,
      created_at:
        new Date().toISOString(),
    }));

  const {
    error,
  } = await supabaseAdmin
    .from("tenant_roles")
    .insert(inserts);

  if (error) {
    throw error;
  }

  return {
    success: true,
    roles,
  };
}
