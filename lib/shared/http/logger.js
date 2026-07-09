export function logInfo(scope, message, data = {}) {
  if (process.env.NODE_ENV !== "production") console.log(
    JSON.stringify({
      level: "info",
      scope,
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  );
}

export function logError(scope, message, error = null) {
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
      timestamp: new Date().toISOString(),
    })
  );
}