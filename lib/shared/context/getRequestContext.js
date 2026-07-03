import { resolveIdentity } from "@/lib/shared/identity/resolveIdentity";

/**
 * SINGLE SOURCE OF TRUTH FOR REQUEST CONTEXT
 */

export async function getRequestContext({ userEmail }) {
  const identity =
    await resolveIdentity({ userEmail });

  return {
    staff_id: identity.staff_id,
    organization_id: identity.organization_id,
    entity_id: identity.entity_id || null,
    period_id: identity.period_id || null,
  };
}
