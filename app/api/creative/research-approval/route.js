export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativePaidResearchApprovalRuntime } from "@/lib/creative/research/runtime/CreativePaidResearchApprovalRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function accessFor(request, organizationId) {
  return requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: ["creative.execute", "creative.production.run", "creative.*"],
  });
}
function idsFromUrl(request) {
  const url = new URL(request.url);
  return {
    organization_id: text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId")),
    creative_mission_id: text(url.searchParams.get("creative_mission_id") || url.searchParams.get("creativeMissionId")),
    creative_project_id: text(url.searchParams.get("creative_project_id") || url.searchParams.get("creativeProjectId")),
  };
}

function validateIds(ids) {
  if (!ids.organization_id) throw new Error("organization_id required");
  if (!ids.creative_mission_id) throw new Error("creative_mission_id required");
  if (!ids.creative_project_id) throw new Error("creative_project_id required");
}

export async function GET(request) {
  try {
    const ids = idsFromUrl(request);
    validateIds(ids);
    const access = await accessFor(request, ids.organization_id);
    if (!access.success) return json(access, access.status);
    if (!access.access?.staffAccountId) {
      return json({ success: false, error: "Authenticated staff account required" }, 403);
    }

    const result = await CreativePaidResearchApprovalRuntime.preflight(ids);
    return json(result, result.paid_research_authorized ? 200 : 409);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids = {
      organization_id: text(body.organization_id || body.organizationId),
      creative_mission_id: text(body.creative_mission_id || body.creativeMissionId),
      creative_project_id: text(body.creative_project_id || body.creativeProjectId),
    };
    validateIds(ids);
    const access = await accessFor(request, ids.organization_id);
    if (!access.success) return json(access, access.status);
    if (!access.access?.staffAccountId) {
      return json({ success: false, error: "Authenticated staff account required" }, 403);
    }

    const result = await CreativePaidResearchApprovalRuntime.approve({
      ...ids,
      approval_phrase: body.approval_phrase,
      approved_by_user_id: access.userId,
      approved_by_staff_account_id: access.access.staffAccountId,
      approved_by_email: access.userEmail || null,
    });
    return json(result);
  } catch (error) {
    if (error?.preflight) return json({ ...error.preflight, error: error.message }, 409);
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
