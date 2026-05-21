import { supabase }
  from "@/lib/supabase";

export async function activateModule(
  data
) {

  const {

    tenant_id,

    module_id,

    activated_by,

  } = data;

  const {
    data: module,
    error,
  } = await supabase

    .from(
      "tenant_modules"
    )

    .upsert({

      tenant_id,

      module_id,

      enabled: true,

      activated_by,

      activated_at:
        new Date().toISOString(),

    })

    .select()

    .single();

  if (error)
    throw error;

  return module;

}
