export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const CONTRACT = "AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED_V1";
const SUCCESSOR = "/api/operator/transcribe";

function disabledResponse() {
  return Response.json(
    {
      success: false,
      error: "Avantiqo owned realtime transcription is not certified yet",
      code: "AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED",
      contract: CONTRACT,
      realtime_streaming_certified: false,
      provider_session_allowed: false,
      ephemeral_provider_credential_allowed: false,
      browser_provider_websocket_allowed: false,
      fallback: "GOVERNED_ASYNC_STT",
      successor: SUCCESSOR,
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store, private",
        "X-Avantiqo-Voice-Contract": CONTRACT,
        "X-Avantiqo-Voice-Successor": SUCCESSOR,
      },
    },
  );
}

export async function POST() {
  return disabledResponse();
}
