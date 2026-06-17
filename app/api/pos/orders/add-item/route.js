import { addItemTransaction } from "@/lib/shared/ubte/modules/pos/posTransactions";
import { getRequestContext } from "@/lib/shared/context/getRequestContext";

export async function POST(req) {
  try {
    const body = await req.json();

    const { userEmail, order_id, item } = body;

    if (!userEmail || !order_id || !item) {
      return Response.json(
        { error: "Missing data" },
        { status: 400 }
      );
    }

    const ctx = await getRequestContext({ userEmail });

    const result = await addItemTransaction({
      tenant_id: ctx.tenant_id,
      organization_id: ctx.organization_id,
      staff_id: ctx.staff_id,
      order_id,
      item,
    });

    return Response.json({
      success: true,
      data: result,
    });

  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
