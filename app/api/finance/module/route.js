import { financeModule } from "@/lib/finance/financeModule";

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const organizationId = searchParams.get("organizationId");
  const periodStart = searchParams.get("periodStart");
  const periodEnd = searchParams.get("periodEnd");

  if (!organizationId) {
    return Response.json(
      { success: false, error: "Missing organizationId" },
      { status: 400 }
    );
  }

  const data = await financeModule({
    organizationId,
    periodStart,
    periodEnd
  });

  return Response.json({
    success: true,
    data
  });
}
