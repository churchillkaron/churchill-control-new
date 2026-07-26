export const dynamic = "force-dynamic";

import { financeModule } from "@/lib/finance/financeModule";
import { resolveReportRequestContext } from "@/lib/finance/reporting/runtime/resolveReportRequestContext";

export async function GET(request) {
  try {
    const context = await resolveReportRequestContext(
      new URL(request.url).searchParams
    );

    if (!context.success) {
      return Response.json(
        { success: false, error: context.error },
        { status: context.status || 400 }
      );
    }

    const data = await financeModule({
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodStart: context.startDate,
      periodEnd: context.endDate,
    });

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Finance module failed",
      },
      { status: error.status || 500 }
    );
  }
}
