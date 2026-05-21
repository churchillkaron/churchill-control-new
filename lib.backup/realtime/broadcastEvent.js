export default async function broadcastEvent({
  channel,
  event,
  payload,
}) {
  console.log("REALTIME_EVENT", {
    channel,
    event,
    payload,
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
  };
}
