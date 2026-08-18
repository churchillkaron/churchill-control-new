export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { getProofOfServiceReport } from "@/lib/service-management/runtime/ProofOfServiceRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Proof of service lookup failed." },
    { status: error?.status || status },
  );
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const report = await getProofOfServiceReport({
      context: resolved.context,
      occurrenceId: resolvedParams?.occurrenceId,
    });

    return Response.json({ success: true, report });
  } catch (error) {
    return responseError(error);
  }
}
