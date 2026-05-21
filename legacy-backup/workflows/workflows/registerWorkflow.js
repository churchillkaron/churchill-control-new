import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function registerWorkflow({
  tenant_id,
  name,
  trigger_event,
  action,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("workflow_registry")
      .insert([
        {
          tenant_id,
          name,
          trigger_event,
          action,
          active: true,
          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      workflow: data,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
