import { supabase }
from "@/lib/shared/supabase/client";

import defaultPOSSettings
from "@/lib/settings/defaultPOSSettings";

export default async function loadOperationalSettings({

  tenantId,

  domain,

}) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "operational_settings"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "domain",
      domain
    )

    .maybeSingle();

  if (
    error &&
    error.code !== "PGRST116"
  ) {

    throw error;

  }

  const storedSettings =
    data?.settings || {};

  let defaults = {};

  if (domain === "POS") {

    defaults =
      defaultPOSSettings;

  }

  return {

    ...defaults,

    ...storedSettings,

  };

}
