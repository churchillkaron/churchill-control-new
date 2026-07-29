export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  listUserOperationsRoleAssignments,
} from "@/lib/operations/security/OperationsPermissionRepository";

function isMissingOperationsSecuritySchema(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  return code === "42P01"
    || code === "PGRST205"
    || /operations_(roles|role_permissions)|user_operations_roles/i.test(message);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resolved = await resolveOperationsRequestContext({
    request,
    input: searchParamsToObject(searchParams),
    authorize: false,
  });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  try {
    const permissions = resolved.context.permissions || [];
    let assignments = [];
    let securitySchemaReady = resolved.operations_security_schema_ready !== false;

    if (resolved.user?.id && securitySchemaReady) {
      try {
        assignments = await listUserOperationsRoleAssignments({
          organizationId: resolved.context.organization_id,
          userId: resolved.user.id,
        });
      } catch (error) {
        if (!isMissingOperationsSecuritySchema(error)) throw error;
        securitySchemaReady = false;
      }
    }

    const can = Object.freeze({
      view: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.VIEW }),
      create: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.CREATE }),
      update: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.UPDATE }),
      execute: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.EXECUTE }),
      control: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.CONTROL }),
      audit: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.AUDIT }),
      manage_events: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.EVENTS_MANAGE }),
      import: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.IMPORT }),
      ai: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.AI }),
      administer: hasOperationsPermission({ permissions, action: OPERATIONS_ACTIONS.ADMINISTER }),
    });

    return NextResponse.json({
      ok: true,
      organization_id: resolved.context.organization_id,
      user: resolved.user || null,
      role: resolved.context.role || null,
      permissions,
      assignments,
      can,
      operations_security_schema_ready: securitySchemaReady,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations access could not be resolved." },
      { status: 500 },
    );
  }
}
