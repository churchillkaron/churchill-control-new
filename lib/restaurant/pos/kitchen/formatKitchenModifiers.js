export function formatKitchenConfiguration Options(
  modifiers = []
) {

  if (
    !modifiers.length
  ) {
    return ''
  }

  return modifiers
    .map(
      modifier =>
        `• ${modifier.name}`
    )
    .join('\n')
}
