import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * Build full workspace from industry template
 */
export async function buildWorkspaceFromTemplate({
  organizationId,
  industry,
  installedBy = "system"
}) {
  // 1. Get template
  const { data: template } = await supabaseAdmin
    .from("workspace_templates")
    .select("*")
    .eq("industry", industry)
    .single();

  if (!template) {
    throw new Error(`No template found for industry: ${industry}`);
  }

  // 2. Assign template
  await supabaseAdmin
    .from("organization_template_assignments")
    .insert({
      organization_id: organizationId,
      template_id: template.id,
      installed_by: installedBy
    });

  // 3. Get template modules
  const { data: modules } = await supabaseAdmin
    .from("workspace_template_modules")
    .select("*")
    .eq("template_id", template.id);

  // 4. Install modules
  if (modules?.length) {
    await supabaseAdmin.from("organization_modules").insert(
      modules.map((m) => ({
        organization_id: organizationId,
        module_id: m.module_id,
        status: "active"
      }))
    );
  }

  // 5. Create workspace settings (default)
  await supabaseAdmin
    .from("organization_workspace_settings")
    .insert({
      organization_id: organizationId,
      metric_cards: [],
      alerts: [],
      favorite_modules: [],
      layout: {
        theme: "dark",
        density: "comfortable"
      }
    });

  return {
    success: true,
    templateId: template.id,
    modulesInstalled: modules?.length || 0
  };
}
