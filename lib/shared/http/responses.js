function serializeError(error) {
  if (!error) return null;
  if (typeof error === "string") return { message: error };

  return {
    name: error.name || "Error",
    message: error.message || "Internal server error",
    stage: error.stage || null,
    code: error.code || null,
    provider: error.provider || null,
    channel_id: error.channel_id || null,
    correction: error.correction || null,
    details: error.details || null,
  };
}

export function success(data = {}, message = "Success") {
  return Response.json({
    success: true,
    message,
    data,
  });
}

export function failure(message = "Error", error = null, status = 500) {
  const responseStatus = Number(error?.status || status || 500);

  return Response.json(
    {
      success: false,
      message,
      error: serializeError(error),
    },
    { status: responseStatus },
  );
}
