import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function buildOrganizationTree({
  organizationIds = [],
}) {

  const supabase =
    createServerSupabase();

  const {
    data: organizations,
    error,
  } = await supabase
    .from("organizations")
    .select("*")
    .in("id", organizationIds);

  if (error) {

    return {
      success: false,
      error: error.message,
    };

  }

  const map = {};

  for (const organization of organizations || []) {

    map[organization.id] = {
      ...organization,
      children: [],
    };

  }

  const roots = [];

  for (const organization of organizations || []) {

    if (
      organization.parent_organization_id &&
      map[
        organization.parent_organization_id
      ]
    ) {

      map[
        organization.parent_organization_id
      ].children.push(
        map[organization.id]
      );

    } else {

      roots.push(
        map[organization.id]
      );

    }

  }

  return {
    success: true,
    organizations:
      organizations || [],
    tree: roots,
  };

}
