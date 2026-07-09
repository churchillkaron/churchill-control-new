export default async function broadcastEvent({
  channel,
  event,
  payload,
}) {
  if (process.env.NODE_ENV !== "production") console.log("REALTIME_EVENT", {
    channel,
    event,
    payload,
  });

  return {
    success: true,
    timestamp: new Date().toISOString(),
  };
}
