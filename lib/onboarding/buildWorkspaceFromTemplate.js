import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeIndustry(value) {
  return String(value || "").trim().toLowerCase();
}

function labelFromIndustry(industry) {
  return String(industry || "")
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

/**
 * Return only industries backed by a real governed workspace template.
 * This is the onboarding authority: the UI must not invent industry choices.
 */
export async function listAvailableWorkspaceTemplates() {
  const result = await supabaseAdmin
    .from("workspace_templates")
    .select("id,industry,name")
    .order("industry", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  const seen = new Set();

  return (result.data || [])
    .map((template) => {
      const industry = normalizeIndustry(template.industry);

      if (!industry || !template.id || seen.has(industry)) {
        return null;
      }

      seen.add(industry);

      return {
        id: template.id,
        industry,
        label: String(template.name || "").trim() || labelFromIndustry(industry),
      };
    })
    .filter(Boolean);
}

export async function requireWorkspaceTemplate(industry) {
  const normalizedIndustry = normalizeIndustry(industry);

  if (!normalizedIndustry) {
    throw new Error("industry required");
  }

  const result = await supabaseAdmin
    .from("workspace_templates")
    .select("*")
    .eq("industry", normalizedIndustry)
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data?.id) {
    throw new Error(`No governed workspace template exists for industry: ${normalizedIndustry}`);
  }

  return result.data;
}

/**
 * Build full workspace from an existing governed industry template.
 */
export async function buildWorkspaceFromTemplate({
  organizationId,
  industry,
  installedBy = "system",
}) {
  const template = await requireWorkspaceTemplate(industry);

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
    industry: normalizeIndustry(template.industry),
    modulesInstalled: modules.length,
  };
}
