import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getObjectConfigurationGroups({
  objectType,
  objectId,
}) {
  if (!objectType || !objectId) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("object_configuration_groups")
    .select(`
      id,
      object_type,
      object_id,
      configuration_group_id,
      sort_order,
      configuration_groups (
        id,
        name,
        key,
        required,
        multi_select,
        max_select,
        sort_order,
        is_active,
        configuration_options (
          id,
          name,
          value,
          description,
          price_delta,
          sort_order,
          is_default,
          is_active
        )
      )
    `)
    .eq("object_type", objectType)
    .eq("object_id", objectId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => {
      const group = row.configuration_groups || {};

      return {
        id: group.id,
        key:
          group.key ||
          String(group.name || group.id || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, ""),
        name: group.name,
        label: group.name,
        required: Boolean(group.required),
        multi_select: Boolean(group.multi_select),
        max_select: group.max_select || 1,
        sort_order: row.sort_order ?? group.sort_order ?? 0,
        options: (group.configuration_options || [])
          .filter((option) => option.is_active !== false)
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map((option) => ({
            id: option.id,
            name: option.name,
            label: option.name,
            value: option.value || option.name,
            description: option.description,
            price_delta: Number(option.price_delta || 0),
            sort_order: option.sort_order || 0,
            is_default: Boolean(option.is_default),
          })),
      };
    })
    .filter((group) => group.id && group.options.length)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}
