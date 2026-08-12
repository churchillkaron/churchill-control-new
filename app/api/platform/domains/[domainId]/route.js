import { NextResponse } from "next/server";
import {
  getErpDomains,
  getWorkspaceGroups,
  getWorkspaceItems,
  getWorkspaceMeta,
} from "@/lib/platform/registry/erpRegistry";

export async function GET(request, { params }) {
  const domainId = String(params?.domainId || "").trim();

  if (domainId === "services") {
    return NextResponse.json(
      { success: false, error: "DOMAIN_NOT_FOUND" },
      { status: 404 },
    );
  }

  const domain = getErpDomains().find((item) => item.id === domainId) || null;

  if (!domain) {
    return NextResponse.json(
      { success: false, error: "DOMAIN_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    domain,
    workspace: getWorkspaceMeta(domain.id),
    groups: getWorkspaceGroups(domain.id),
    items: getWorkspaceItems(domain.id),
  });
}
