export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  createServiceExecutionTemplate,
  getServiceExecutionTemplates,
} from "@/lib/service-management/runtime/ServiceExecutionTemplateRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Execution template request failed." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await getServiceExecutionTemplates({ context: resolved.context, filters: input });
    return Response.json({ success: true, count: rows.length, rows });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const row = await createServiceExecutionTemplate({ context: resolved.context, input: body });
    return Response.json({ success: true, row }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
