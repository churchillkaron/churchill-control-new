import { resolveFinanceAction } from "./resolveFinanceAction";

export async function runFinanceAction({
  route,
  actionId,
  payload,
  endpoint,
  organization_id,
  entity_id,
  period_id
}) {
  const action = resolveFinanceAction({ route, actionId });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      organization_id,
      entity_id,
      period_id,
      capability: action.capability
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error || "ACTION_FAILED");
  }

  return await res.json();
}
