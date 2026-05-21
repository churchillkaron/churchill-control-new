export function formatKitchenModifiers(
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
