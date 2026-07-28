import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
}

export async function listFinancePermissions(organizationId) {
  requireOrganizationId(organizationId);
