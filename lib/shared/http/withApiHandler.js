import { success, failure } from "./responses";
import { logError, logInfo } from "./logger";

export function withApiHandler(scope, handler) {
  return async function (req) {
    try {
      logInfo(scope, "API request started");

      const result = await handler(req);

      logInfo(scope, "API request successful");

      return success(result);
    } catch (error) {
      logError(scope, "API request failed", error);

      return failure(
        error?.message || "Internal server error",
        error,
        500
      );
    }
  };
}