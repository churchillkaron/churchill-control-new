const RELAY_CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_V2";

Deno.serve(() =>
  new Response(
    JSON.stringify({
      success: false,
      contract: RELAY_CONTRACT,
      error: "AVANTIQO_VOICE_REALTIME_MODAL_RUNTIME_NOT_CERTIFIED",
      realtime_available: false,
      fallback_to_batch_transcription_required: true,
      external_provider_fallback_allowed: false,
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  )
);
