import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createPostingRule(data) {
  const { data: rule, error } = await supabase
    .from("accounting_posting_rules")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return rule;
}
