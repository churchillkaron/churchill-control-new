import { resolveIdentity } from "@/lib/shared/identity/resolveIdentity";

/**
 * SINGLE SOURCE OF TRUTH FOR ALL POS / UBTE REQUESTS
 */
export async function getRequestContext({ userEmail }) {
  const identity = await resolveIdentity({ userEmail });

  return {
    staff_id: identity.staff_id,
    organization_id: identity.organization_id,
    tenant_id: identity.tenant_id // legacy support only
  };
}
