import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeIndustry(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function labelFromTemplate(template = {}) {
  const templateName = String(template.name || "").trim();

  if (templateName) {
    return templateName.replace(/\s+template$/i, "").trim() || templateName;
  }

  return normalizeIndustry(template.industry)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function organizationTypeForIndustry(industry) {
  const normalized = normalizeIndustry(industry);

  if (normalized === "accounting_firm") return "accounting_firm";
  if (normalized === "enterprise") return "direct_business";

  return "client_company";
}

export async function getOnboardingIndustryOptions() {
  const { data, error } = await supabaseAdmin
    .from("workspace_templates")
    .select("id,industry,name,status")
    .eq("status", "ACTIVE")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  const seen = new Set();

  return (data || [])
    .map((template) => {
      const value = normalizeIndustry(template.industry);

      return {
        templateId: template.id,
        value,
        label: labelFromTemplate(template),
        organizationType: organizationTypeForIndustry(value),
      };
    })
    .filter((option) => {
      if (!option.value || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
}

export async function requireOnboardingIndustry(industry) {
  const normalized = normalizeIndustry(industry);
  const options = await getOnboardingIndustryOptions();
  const option = options.find((item) => item.value === normalized) || null;

  if (!option) {
    const error = new Error(
      "The selected business type is not currently available for onboarding"
    );
    error.code = "ONBOARDING_INDUSTRY_UNAVAILABLE";
    throw error;
  }

  return option;
}
