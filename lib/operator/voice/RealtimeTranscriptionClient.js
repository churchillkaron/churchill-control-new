const CONTRACT = "AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED_V1";
const ERROR_CODE = "AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED";

export function realtimeTranscriptionCertification() {
  return {
    contract: CONTRACT,
    realtime_streaming_certified: false,
    provider_session_allowed: false,
    ephemeral_provider_credential_allowed: false,
    browser_provider_websocket_allowed: false,
    fallback: "GOVERNED_ASYNC_STT",
  };
}

export async function startRealtimeTranscription() {
  const error = new Error(ERROR_CODE);
  error.code = ERROR_CODE;
  error.contract = CONTRACT;
  error.realtime_streaming_certified = false;
  error.fallback = "GOVERNED_ASYNC_STT";
  throw error;
}
