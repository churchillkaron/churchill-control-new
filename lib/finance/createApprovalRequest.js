import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createApprovalRequest(data) {
  const { data: approval, error } = await supabaseAdmin
    .from("accounting_approvals")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return approval;
}
