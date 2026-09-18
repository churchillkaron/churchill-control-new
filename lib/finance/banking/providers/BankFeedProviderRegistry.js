import BrankasStatementProvider from "./BrankasStatementProvider";

const providers = new Map([[BrankasStatementProvider.id, BrankasStatementProvider]]);
export function getBankFeedProvider(providerName) {
  const key = String(providerName || "").trim().toLowerCase();
  const provider = providers.get(key);
  if (!provider) throw new Error(`BANK_FEED_PROVIDER_UNSUPPORTED:${key || "missing"}`);
  return provider;
}
export function listBankFeedProviders() { return [...providers.values()].map((provider) => ({ id: provider.id, display_name: provider.displayName })); }
