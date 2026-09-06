import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * Build full workspace from an existing governed industry template.
 */
export async function buildWorkspaceFromTemplate({
  organizationId,
  industry,
  installedBy = "system",
}) {
  const templateResult = await supabaseAdmin
    .from("workspace_templates")
    .select("*")
    .eq("industry", industry)
    .single();

  if (templateResult.error) {
    throw templateResult.error;
  }

  const template = templateResult.data;

  if (!template?.id) {
    throw new Error(`No template found for industry: ${industry}`);
  }

  const assignmentResult = await supabaseAdmin
    .from("organization_template_assignments")
    .insert({
      organization_id: organizationId,
      template_id: template.id,
      installed_by: installedBy,
    });

  if (assignmentResult.error) {
    throw assignmentResult.error;
  }

  const modulesResult = await supabaseAdmin
    .from("workspace_template_modules")
    .select("*")
    .eq("template_id", template.id);

  if (modulesResult.error) {
    throw modulesResult.error;
  }

  const modules = modulesResult.data || [];

  if (modules.length) {
    const installResult = await supabaseAdmin.from("organization_modules").insert(
      modules.map((module) => ({
        organization_id: organizationId,
        module_id: module.module_id,
        status: "active",
      }))
    );

    if (installResult.error) {
      throw installResult.error;
    }
  }

  const settingsResult = await supabaseAdmin
    .from("organization_workspace_settings")
    .insert({
      organization_id: organizationId,
      metric_cards: [],
      alerts: [],
      favorite_modules: [],
      layout: {
        theme: "light",
        density: "comfortable",
      },
    });

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  return {
    success: true,
    templateId: template.id,
    modulesInstalled: modules.length,
  };
}
