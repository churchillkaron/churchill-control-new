export function resolveRowAction({
  action,
  row,
  organizationId,
  entityId,
}) {

  const kind =
    String(
      action?.action ||
      action?.type ||
      action?.id ||
      ""
    )
      .toLowerCase()
      .replace(/-/g, "_");


  if (
    action?.endpoint
  ) {

    return {
      endpoint:
        action.endpoint,

      method:
        action.method ||
        "POST",

      payload: {
        provider_id:
          row?.provider_id ||
          row?.id ||
          null,

        organization_id:
          organizationId,

        entity_id:
          entityId,
      },
    };

  }


  return null;

}
