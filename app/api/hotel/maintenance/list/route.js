import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(
      request.nextUrl.searchParams.get("organizationId") ||
        request.nextUrl.searchParams.get("organization_id") ||
        "",
    ).trim();

    if (!organizationId) {
      return errorResponse("organizationId required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("hotel_maintenance_tasks")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (tasksError) throw tasksError;

    const propertyIds = [
      ...new Set((tasks || []).map((task) => task.property_id).filter(Boolean)),
    ];

    let propertyById = new Map();

    if (propertyIds.length > 0) {
      const { data: properties, error: propertiesError } = await supabaseAdmin
        .from("hotel_properties")
        .select("id,name")
        .eq("organization_id", access.organizationId)
        .in("id", propertyIds);

      if (propertiesError) throw propertiesError;
      propertyById = new Map((properties || []).map((property) => [property.id, property]));
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      tasks: (tasks || []).map((task) => ({
        ...task,
        hotel_properties: propertyById.get(task.property_id) || null,
      })),
    });
  } catch (error) {
    console.error("HOTEL_MAINTENANCE_LIST_ERROR", error);
    return errorResponse(error?.message || "Maintenance list failed");
  }
}
