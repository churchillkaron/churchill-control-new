const LANE_STARTUP_TIMEOUT_SECONDS = Object.freeze({ fast: 60, deep: 120 });
const LANE_HARD_TIMEOUT_SECONDS = Object.freeze({ fast: 60, deep: 600 });
const SCALE_DOWN_SECONDS = 5;

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function intelligenceModalOverflowThbPerSecond() {
  const rate = positive(process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND);
  if (!rate) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND_REQUIRED");
  return rate;
}


export function intelligenceModalOverflowLaneStartupTimeoutSeconds(lane) {
  const normalized = text(lane, 40).toLowerCase();
  const seconds = LANE_STARTUP_TIMEOUT_SECONDS[normalized];
  if (!seconds) throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_STARTUP_COST_LANE_INVALID:${normalized || "NONE"}`);
  return seconds;
}

export function intelligenceModalOverflowLaneHardTimeoutSeconds(lane) {
  const normalized = text(lane, 40).toLowerCase();
  const seconds = LANE_HARD_TIMEOUT_SECONDS[normalized];
  if (!seconds) throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_COST_LANE_INVALID:${normalized || "NONE"}`);
  return seconds;
}

export function intelligenceModalOverflowMinimumCeilingThb(lane) {
  const rate = intelligenceModalOverflowThbPerSecond();
  const startupTimeoutSeconds = intelligenceModalOverflowLaneStartupTimeoutSeconds(lane);
  const hardTimeoutSeconds = intelligenceModalOverflowLaneHardTimeoutSeconds(lane);
  return Number(((startupTimeoutSeconds + hardTimeoutSeconds + SCALE_DOWN_SECONDS) * rate).toFixed(6));
}

export function assertIntelligenceModalOverflowCeiling({ lane, ceilingThb } = {}) {
  const ceiling = positive(ceilingThb);
  if (!ceiling) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_APPROVED_CEILING_REQUIRED");
  const minimum = intelligenceModalOverflowMinimumCeilingThb(lane);
  if (ceiling + 0.000001 < minimum) {
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_CEILING_BELOW_BOUNDED_WORST_CASE:${ceiling}:${minimum}`);
  }
  return {
    lane: text(lane, 40).toLowerCase(),
    approved_ceiling_thb: ceiling,
    minimum_bounded_ceiling_thb: minimum,
    thb_per_second: intelligenceModalOverflowThbPerSecond(),
    startup_timeout_seconds: intelligenceModalOverflowLaneStartupTimeoutSeconds(lane),
    hard_timeout_seconds: intelligenceModalOverflowLaneHardTimeoutSeconds(lane),
    scale_down_seconds: SCALE_DOWN_SECONDS,
  };
}

export function measuredIntelligenceModalOverflowSupplierCostThb({ lane, wallSeconds } = {}) {
  const seconds = Number(wallSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_WALL_SECONDS_REQUIRED");
  }
  const rate = intelligenceModalOverflowThbPerSecond();
  const startup = intelligenceModalOverflowLaneStartupTimeoutSeconds(lane);
  const input = intelligenceModalOverflowLaneHardTimeoutSeconds(lane);
  const boundedWallSeconds = Math.min(seconds, startup + input);
  return {
    supplier_cost_thb: Number(((boundedWallSeconds + SCALE_DOWN_SECONDS) * rate).toFixed(6)),
    measured_wall_seconds: seconds,
    bounded_billable_seconds: boundedWallSeconds,
    startup_timeout_seconds: startup,
    input_timeout_seconds: input,
    scale_down_seconds: SCALE_DOWN_SECONDS,
    thb_per_second: rate,
    rate_source: "AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND",
  };
}

export const AVANTIQO_INTELLIGENCE_MODAL_SCALE_DOWN_SECONDS = SCALE_DOWN_SECONDS;
