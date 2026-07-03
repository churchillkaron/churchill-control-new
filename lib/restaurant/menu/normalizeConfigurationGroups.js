export function normalizeConfigurationGroups(input) {
  const raw =
    Array.isArray(input)
      ? input
      : (input?.configurationGroups ||
         input?.configuration_groups ||
         input?.order_modifiers ||
         input?.modifiers ||
         []);

  if (!Array.isArray(raw)) return [];

  return raw
    .map((group) => ({
      key: group.key || group.id || group.name,
      label: group.label || group.name || group.key,
      required: Boolean(group.required),
      options: Array.isArray(group.options)
        ? group.options.map((option) => ({
            value: typeof option === "string" ? option : option.value,
            label: typeof option === "string" ? option : option.label,
          }))
        : [],
    }))
    .filter((group) => group.key && group.options.length);
}
