import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeIndustry(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(value) {
  return normalizeIndustry(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recordActive(record = {}) {
  if (record.archived === true) return false;
  if (record.active === false || record.is_active === false || record.enabled === false) {
    return false;
  }

  const status = clean(record.status).toUpperCase();
  return !["INACTIVE", "DISABLED", "ARCHIVED", "RETIRED"].includes(status);
}

export async function listOnboardingWorkspaceTemplates() {
  const { data, error } = await supabaseAdmin
    .from("workspace_templates")
    .select("*")
    .order("industry", { ascending: true });

  if (error) throw error;

  const byIndustry = new Map();

  for (const template of data || []) {
    if (!recordActive(template)) continue;

    const industry = normalizeIndustry(template.industry);
    if (!industry || byIndustry.has(industry)) continue;

    byIndustry.set(industry, {
      id: template.id,
      industry,
      label:
        clean(template.display_name) ||
        clean(template.name) ||
        clean(template.title) ||
        titleCase(industry),
    });
  }

  return [...byIndustry.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export async function requireOnboardingWorkspaceTemplate(industry) {
  const normalizedIndustry = normalizeIndustry(industry);

  if (!normalizedIndustry) {
    throw new Error("Industry required");
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_templates")
    .select("*")
    .eq("industry", normalizedIndustry);

  if (error) throw error;

  const template = (data || []).find(recordActive) || null;

  if (!template?.id) {
    const error = new Error(
      `This industry is not currently available for governed onboarding: ${normalizedIndustry}`
    );
    error.code = "ONBOARDING_TEMPLATE_UNAVAILABLE";
    throw error;
  }

  return template;
}
