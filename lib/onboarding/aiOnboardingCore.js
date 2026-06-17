/**
 * FINAL AI ONBOARDING CORE (SAAS ENABLED)
 */

export function detectIndustry(input = {}) {
  const name = input.name?.toLowerCase?.() || "";

  if (
    name.includes("restaurant") ||
    name.includes("bar") ||
    name.includes("food")
  ) return "restaurant";

  if (
    name.includes("hotel") ||
    name.includes("resort")
  ) return "hotel";

  if (
    name.includes("clinic") ||
    name.includes("hospital")
  ) return "healthcare";

  return "agency";
}

export function selectModules(industry = "agency") {
  const base = ["owner_ai", "analytics", "customer_portal"];

  const map = {
    restaurant: ["pos", "inventory", "finance"],
    hotel: ["pos", "inventory", "housekeeping", "workforce"],
    healthcare: ["patients", "appointments", "finance"],
    agency: ["crm", "projects", "finance"],
  };

  return [...new Set([...(map[industry] || []), ...base])];
}

export function assignPlan(industry) {
  if (industry === "restaurant") return "pro";
  if (industry === "hotel") return "enterprise";
  if (industry === "healthcare") return "enterprise";
  return "free";
}

export function buildOnboardingCore(input = {}) {
  const industry = detectIndustry(input);
  const modules = selectModules(industry);
  const plan = assignPlan(industry);

  return {
    organization: {
      name: input.name || null,
      organizationType: "client_company",
      industry,
      plan, // 🔥 NEW: SAAS PLAN ATTACHED
    },
    owner: {
      email: input.ownerEmail || null,
    },
    modules,
    plan,
    redirectTo: "/workspace",
  };
}
