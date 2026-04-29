export const dynamic = "force-dynamic";

import { runProduction } from "@/lib/production";

export async function POST(req) {
  try {
    const body = await req.json();

    const { dish_id, quantity, source_id, tenant_id } = body;

    if (!tenant_id) {
      return Response.json(
        { error: "Missing tenant_id" },
        { status: 400 }
      );
    }

    if (!dish_id || !quantity || quantity <= 0) {
      return Response.json(
        { error: "Missing or invalid dish_id / quantity" },
        { status: 400 }
      );
    }

    const result = await runProduction({
      tenant_id,
      dish_id,
      quantity,
      source_id,
    });

    return Response.json(result);

  } catch (err) {
    console.error("PRODUCTION RUN ERROR:", err);

    return Response.json(
      { error: err.message || "Production failed" },
      { status: 500 }
    );
  }
}