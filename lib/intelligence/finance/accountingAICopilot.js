import { supabase } from "@/lib/supabase";

export async function accountingAICopilot({
  tenantId,
  message,
}) {
  const response =
    "AI detected financial optimization opportunities and operational accounting insights.";

  const { data, error } = await supabase
    .from("accounting_ai_chat_logs")
    .insert({
      tenant_id: tenantId,
      user_message: message,
      ai_response: response,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
