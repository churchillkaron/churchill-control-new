import { supabase } from "@/lib/supabase";

export async function createApprovalWorkflow(data) {
  const { data: workflow, error } =
    await supabase
      .from(
        "accounting_approval_workflows"
      )
      .insert({
        ...data,
        status: "pending",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return workflow;
}
