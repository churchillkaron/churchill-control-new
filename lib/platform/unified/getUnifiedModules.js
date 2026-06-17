import { SYSTEM_REGISTRY } from "@/lib/shared/architecture/systemRegistry";
import { DOMAIN_REGISTRY } from "@/lib/platform/domains/domainRegistry";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * SINGLE SOURCE OF TRUTH FOR ENTIRE PLATFORM
 */

export async function getUnifiedModules({ organizationId }) {

  // 1. PLATFORM MODULES (what exists globally)
  const platformModules = await getAvailableModules({
    organizationId,
  });

  // 2. DOMAIN MODULES (business capabilities)
  const domainModules = Object.values(DOMAIN_REGISTRY);

  // 3. EXECUTIVE STRUCTURE
  const system = SYSTEM_REGISTRY;

  // 4. ORGANIZATION INSTALLED MODULES
  const { data: installed } = await supabaseAdmin
    .from("organization_modules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE");

  const installedMap = new Set(
    (installed || []).map(m => m.module_id)
  );

  return {
    system,
    domainModules,
    platformModules,
    installedModules: (platformModules || []).filter(m =>
      installedMap.has(m.id)
    ),
  };
}
