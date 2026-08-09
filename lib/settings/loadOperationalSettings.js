import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import defaultPOSSettings from "@/lib/settings/defaultPOSSettings";

export default async function loadOperationalSettings({
  organizationId,
  domain,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!domain) {
    throw new Error("domain required");
  }

  const { data, error } = await supabaseAdmin
    .from("operational_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("domain", domain)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const storedSettings = data?.settings || {};
  const defaults = domain === "POS" ? defaultPOSSettings : {};

  return {
    ...defaults,
    ...storedSettings,
  };
}
