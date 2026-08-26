export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const CONTRACT = "AVANTIQO_OPERATOR_SPEAK_LEGACY_DISABLED_V1";
const SUCCESSOR = "/api/operator/speak/jobs";

function legacyDisabledResponse() {
  return Response.json(
    {
      success: false,
      error: "Legacy synchronous Voice speech endpoint is disabled",
      code: "AVANTIQO_OPERATOR_SPEAK_LEGACY_DISABLED",
      contract: CONTRACT,
      successor: SUCCESSOR,
      async_required: true,
      safe_lease_required: true,
      browser_runpod_access: false,
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "X-Avantiqo-Voice-Contract": CONTRACT,
        "X-Avantiqo-Voice-Successor": SUCCESSOR,
      },
    },
  );
}

export async function POST() {
  return legacyDisabledResponse();
}
