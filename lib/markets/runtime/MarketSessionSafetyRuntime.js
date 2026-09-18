import { AlpacaTradingMetadataProvider } from "@/lib/markets/providers/alpaca/AlpacaTradingMetadataProvider";
import { effectivePaperOrderExpiry } from "@/lib/markets/runtime/MarketPaperOrderLifecycleModels";
import {
  evaluateMarketSessionSafety,
  evaluateTradingClockIntegrity,
} from "@/lib/markets/runtime/MarketSessionSafetyModels";

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

    const integrity = evaluateTradingClockIntegrity({ clock });
    const session = evaluateMarketSessionSafety({
      clock,
      asset,
      allowExtendedHours,
    });
    return {
      ...session,
      approved: integrity.approved && session.approved,
      reasons: [...integrity.reasons, ...session.reasons],
      metrics: {
        ...session.metrics,
        clock_integrity: integrity.metrics,
      },
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
  const integrity = evaluateTradingClockIntegrity({ clock });
  if (!integrity.approved) {
    throw new Error(
      "PAPER_ORDER_TRADING_CLOCK_INVALID:" + integrity.reasons.join("|"),
    );
  }
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
