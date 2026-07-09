export function useCreativeEditor(runtime) {

  const campaignId =
    runtime?.campaignRuntime?.campaign?.id ||
    null;

  return {
    campaignId,
  };

}
