/**
 * HARD RULE ENFORCEMENT
 */

export function assertNoDirectExecutionAccess() {
  throw new Error(
    "DIRECT_PLATFORM_EXECUTION_FORBIDDEN: use UBTE execute() only"
  );
}
