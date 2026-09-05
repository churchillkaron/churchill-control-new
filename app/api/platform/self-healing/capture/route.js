import { capturePlatformUserFailure } from "@/lib/platform/self-healing/PlatformUserFailureCaptureRuntime";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await capturePlatformUserFailure({ request, input: body });
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: result.status || 400 });
    }
    return Response.json(result, { status: result.status || 202 });
  } catch (error) {
    console.error("PLATFORM_USER_FAILURE_CAPTURE_FAILED", {
      error: String(error?.message || error || "PLATFORM_USER_FAILURE_CAPTURE_FAILED").slice(0, 800),
    });
    return Response.json({
      success: false,
      error: "PLATFORM_USER_FAILURE_CAPTURE_FAILED",
    }, { status: 500 });
  }
}
