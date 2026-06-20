import { financeModule } from "@/lib/finance/financeModule";

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const tenantId = searchParams.get("tenantId");
  const organizationId = searchParams.get("organizationId");
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");

  if (!tenantId) {
    return Response.json(
      { success: false, error: "Missing tenantId" },
      { status: 400 }
    );
  }

  const data = await financeModule({
    tenantId,
    organizationId,
    periodStart,
    periodEnd
  });

  return Response.json({
    success: true,
    data
  });
}
