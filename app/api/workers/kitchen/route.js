import { processKitchenEvents } from "@/lib/workers/kitchen/processKitchenEvents";

export async function GET() {
  try {
    const result = await processKitchenEvents();

    return Response.json({
      success: true,
      result,
    });

  } catch (err) {
    return Response.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}
