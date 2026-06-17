import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createApprovalRequest(data) {
  const { data: approval, error } = await supabase
    .from("accounting_approvals")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return approval;
}
