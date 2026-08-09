export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listLoyaltyWorkspace,
  listLoyaltyLedger,
  enrollPartyInLoyalty,
  applyLoyaltyPoints,
  redeemLoyaltyReward,
  createLoyaltyProgram,
  createLoyaltyTier,
  createLoyaltyReward,
} from "@/lib/commercial/customers/LoyaltyService";

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

function organizationIdOf(source = {}) {
  return source.organizationId || source.organization_id || null;
}

function actorId(access) {
  return access?.user?.id || access?.user_id || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status || 403);

    const partyId = searchParams.get("partyId") || searchParams.get("party_id");
    const view = String(searchParams.get("view") || "workspace").toLowerCase();

    if (view === "ledger") {
      if (!partyId) return errorResponse("party_id required for loyalty ledger", 400);
      const rows = await listLoyaltyLedger({
        organizationId: access.organizationId,
        partyId,
        limit: searchParams.get("limit"),
      });
      return Response.json({
        success: true,
        organization_id: access.organizationId,
        party_id: partyId,
        rowCount: rows.length,
        rows,
        ledger: rows,
      });
    }

    return Response.json(
      await listLoyaltyWorkspace({
        organizationId: access.organizationId,
        partyId,
      })
    );
  } catch (error) {
    return errorResponse(error?.message || "Unable to load loyalty workspace", error?.status || 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: organizationIdOf(body),
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status || 403);

    const action = String(body.action || "").trim().toLowerCase();
    const base = {
      ...body,
      organization_id: access.organizationId,
      actor_id: body.actor_id || actorId(access),
    };

    let result;
    switch (action) {
      case "enroll":
        result = await enrollPartyInLoyalty(base);
        break;
      case "earn":
        result = await applyLoyaltyPoints({ ...base, entry_type: "EARN" });
        break;
      case "adjust":
        result = await applyLoyaltyPoints({ ...base, entry_type: "ADJUST" });
        break;
      case "expire":
        result = await applyLoyaltyPoints({ ...base, entry_type: "EXPIRE" });
        break;
      case "redeem_points":
        result = await applyLoyaltyPoints({ ...base, entry_type: "REDEEM" });
        break;
      case "redeem_reward":
        result = await redeemLoyaltyReward(base);
        break;
      case "create_program":
        result = await createLoyaltyProgram(base);
        break;
      case "create_tier":
        result = await createLoyaltyTier(base);
        break;
      case "create_reward":
        result = await createLoyaltyReward(base);
        break;
      default:
        return errorResponse(
          "action must be enroll, earn, adjust, expire, redeem_points, redeem_reward, create_program, create_tier, or create_reward",
          400
        );
    }

    return Response.json({ success: true, action, result });
  } catch (error) {
    return errorResponse(error?.message || "Unable to execute loyalty action", error?.status || 500);
  }
}
