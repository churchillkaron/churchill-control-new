export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  checkBusinessConnectionPlatformReadiness,
  listBusinessConnections,
} from "@/lib/platform/channels/BusinessConnectionRegistry";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PLATFORM_ROLES = new Set(["PLATFORM_OWNER", "SUPER_ADMIN"]);

function text(value) {
  return String(value ?? "").trim();
}

function callbackOrigin(request) {
  const configured =
    text(process.env.NEXT_PUBLIC_APP_URL) ||
    text(process.env.APP_URL) ||
    text(process.env.NEXT_PUBLIC_BASE_URL) ||
    text(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {}
  }
  return new URL(request.url).origin;
}

function publicCallbackUrls(connection, request) {
  const origin = callbackOrigin(request);
  return (connection?.platformSetup?.callbackPaths || []).map((path) => {
    try {
      return new URL(path, origin).toString();
    } catch {
      return path;
    }
  });
}

function platformAccess(access) {
  return PLATFORM_ROLES.has(text(access?.role).toUpperCase());
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    if (!platformAccess(access)) {
      return NextResponse.json(
        { success: false, error: "Platform operator access required" },
        { status: 403 },
      );
    }

    const rows = listBusinessConnections().map((connection) => {
      const readiness = checkBusinessConnectionPlatformReadiness(connection);
      const setup = connection.platformSetup || {};
      const customer = connection.customerSetup || {};

      return {
        id: connection.id,
        name: connection.name,
        category: connection.category,
        description: connection.description,
        authModel: connection.authModel || null,
        availability: connection.availability || "active",
        ready: readiness.ready,
        configured: readiness.configured,
        missing: readiness.missing,
        optionalMissing: readiness.optionalMissing,
        setup: {
          summary: setup.summary || null,
          steps: Array.isArray(setup.steps) ? setup.steps : [],
          approval: setup.approval || null,
          callbackUrls: publicCallbackUrls(connection, request),
        },
        customer: {
          mode: customer.mode || null,
          label: customer.label || null,
          technicalInputRequired: customer.technicalInputRequired === true,
        },
      };
    });

    const ready = rows.filter((row) => row.ready).length;
    const blocked = rows.length - ready;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      summary: {
        providers: rows.length,
        ready,
        blocked,
      },
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Provider setup readiness failed" },
      { status: 500 },
    );
  }
}
