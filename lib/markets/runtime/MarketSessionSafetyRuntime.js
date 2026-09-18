import { AlpacaTradingMetadataProvider } from "@/lib/markets/providers/alpaca/AlpacaTradingMetadataProvider";
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

export const MarketSessionSafetyRuntime = {
  evaluate: evaluateAuthoritativeMarketSession,
};
