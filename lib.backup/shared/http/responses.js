export function success(data = {}, message = "Success") {
  return Response.json({
    success: true,
    message,
    data,
  });
}

export function failure(message = "Error", error = null, status = 500) {
  return Response.json(
    {
      success: false,
      message,
      error,
    },
    { status }
  );
}