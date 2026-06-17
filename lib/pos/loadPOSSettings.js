import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

import {
  POS_MODULE,
} from "./posModuleConfig";

export async function loadPOSSettings({
  organizationId,
}) {

  if (!organizationId) {
    return POS_MODULE;
  }

  const supabase =
    createServerSupabase();

  const {
    data,
  } = await supabase

    .from(
      "organization_workspace_settings"
    )

    .select(
      "pos_settings"
    )

    .eq(
      "organization_id",
      organizationId
    )

    .maybeSingle();

  return {

    ...POS_MODULE,

    ...(data?.pos_settings || {}),

  };

}
