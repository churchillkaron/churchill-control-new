import { AlpacaTradingMetadataProvider } from "@/lib/markets/providers/alpaca/AlpacaTradingMetadataProvider";
import { effectivePaperOrderExpiry } from "@/lib/markets/runtime/MarketPaperOrderLifecycleModels";
import { evaluateMarketSessionSafety } from "@/lib/markets/runtime/MarketSessionSafetyModels";

export async function evaluateAuthoritativeMarketSession({
  organizationId,
  symbol,
  allowExtendedHours = false,
}) {
  try {
    const [clock, asset] = await Promise.all([
      AlpacaTradingMetadataProvider.clock({ organizationId }),
      AlpacaTradingMetadataProvider.asset({ organizationId, symbol }),
    ]);

    return {
      ...evaluateMarketSessionSafety({
        clock,
        asset,
        allowExtendedHours,
      }),
      clock,
      asset,
      provider_available: true,
    };
  } catch (error) {
    return {
      approved: false,
      reasons: [
        String(error?.message || error || "TRADING_SESSION_METADATA_UNAVAILABLE").slice(0, 500),
      ],
      metrics: {
        session_open: false,
        allow_extended_hours: allowExtendedHours === true,
        coverage: "UNAVAILABLE",
      },
      clock: null,
      asset: null,
      provider_available: false,
    };
  }
}

export async function resolvePaperOrderExpiry({
  organizationId,
  timeInForce = "DAY",
  decisionExpiresAt = null,
}) {
  const clock = await AlpacaTradingMetadataProvider.clock({ organizationId });
  const expiresAt = effectivePaperOrderExpiry({
    timeInForce,
    marketNextClose: clock.next_close,
    decisionExpiresAt,
  });
  if (!expiresAt) {
    throw new Error("PAPER_ORDER_EXPIRY_UNRESOLVED");
  }
  return {
    expires_at: expiresAt,
    time_in_force: String(timeInForce || "DAY").toUpperCase(),
    clock,
  };
}

export const MarketSessionSafetyRuntime = {
  evaluate: evaluateAuthoritativeMarketSession,
  resolvePaperOrderExpiry,
};
