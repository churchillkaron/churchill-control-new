import { processWorkCenterEvents } from "@/lib/workers/work-centers/processWorkCenterEvents";

export async function GET() {
  try {
    const result = await processWorkCenterEvents();

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
