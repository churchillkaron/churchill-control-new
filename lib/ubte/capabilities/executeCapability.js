/**
 * UBTE EXECUTION PIPELINE
 *
 * UBTE owns:
 * - capability validation
 * - subscription checks
 * - execution dispatch
 *
 * Service Runtime owns:
 * - providers
 * - pricing
 * - wallet
 * - usage
 * - billing
 */

export async function executeCapability({
  capability,
  context = {},
  payload
}) {

  if (!capability) {
    throw new Error(
      "MISSING_CAPABILITY"
    );
  }


  const {
    feature,
    execution
  } = capability;


  if (!execution) {
    throw new Error(
      "INVALID_CAPABILITY"
    );
  }


  if (
    feature &&
    context.subscription?.features
  ) {

    const allowed =
      context.subscription.features.includes(
        feature
      );


    if (!allowed) {
      throw new Error(
        "SUBSCRIPTION_BLOCKED"
      );
    }

  }


  return await execution(
    payload,
    context
  );

}
