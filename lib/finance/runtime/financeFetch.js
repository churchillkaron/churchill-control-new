export async function financeFetch({
  organization,
  entity,
  period,
  organizationId,
  entityId,
  periodId,
  path,
  options = {},
  body = null,
}) {
  const resolvedOrganizationId =
    organizationId ||
    organization?.id ||
    organization?.organization_id;

  const resolvedEntityId =
    entityId ||
    entity?.id ||
    entity?.entity_id ||
    entity?.entity_id;

  const resolvedPeriodId =
    periodId ||
    period?.id ||
    period?.period_id;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId unavailable");
  }

  const method =
    options.method || (body ? "POST" : "GET");

  if (method === "GET") {
    const url = new URL(path, window.location.origin);

    url.searchParams.set("organizationId", resolvedOrganizationId);

    if (resolvedEntityId) {
      url.searchParams.set("entityId", resolvedEntityId);
    }

    if (resolvedPeriodId) {
      url.searchParams.set("periodId", resolvedPeriodId);
    }

    const res = await fetch(url.toString(), {
      ...options,
      cache: "no-store",
    });

    return await res.json();
  }

  const res = await fetch(path, {
    ...options,
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify({
      ...(body || {}),
      organizationId: resolvedOrganizationId,
      organization_id: resolvedOrganizationId,
      entityId: resolvedEntityId || null,
      entity_id: resolvedEntityId || null,
      entity_id: resolvedEntityId || null,
      periodId: resolvedPeriodId || null,
      period_id: resolvedPeriodId || null,
    }),
  });

  return await res.json();
}
