import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function applyWorkspaceTemplate({
  organizationId,
  templateId,
}) {

  const templateModules =
    await supabaseAdmin
      .from("workspace_template_modules")
      .select("*")
      .eq(
        "template_id",
        templateId
      )
      .order(
        "sort_order"
      );

  if (templateModules.error) {
    throw templateModules.error;
  }

  await supabaseAdmin
    .from("organization_modules")
    .delete()
    .eq(
      "organization_id",
      organizationId
    );

  const rows =
    (templateModules.data || [])
      .map(module => ({

        organization_id:
          organizationId,

        module_id:
          module.module_id,

        status:
          "ACTIVE",

      }));

  const result =
    await supabaseAdmin
      .from("organization_modules")
      .insert(rows)
      .select();

  if (result.error) {
    throw result.error;
  }

  await supabaseAdmin
    .from(
      "organization_template_assignments"
    )
    .insert({

      organization_id:
        organizationId,

      template_id:
        templateId,

    });

  return result.data;

}
