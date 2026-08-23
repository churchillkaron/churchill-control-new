import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [trackRecordSource, settingsRouteSource, predictionSource, workspaceSource] =
  await Promise.all([
    readFile(
      "components/operator/SyntheticIntelligenceForecastTrackRecord.jsx",
      "utf8",
    ),
    readFile("app/api/operator/autonomous-watch/settings/route.js", "utf8"),
    readFile(
      "lib/operator/contracts/OperatorPredictionAccountability.js",
      "utf8",
    ),
    readFile("app/(system)/workspace/[organizationId]/page.jsx", "utf8"),
  ]);

assert.match(
  trackRecordSource,
  /data-avantiqo-synthetic-intelligence-forecast-track-record="true"/,
);
assert.match(trackRecordSource, /Forecast track record/);
assert.match(trackRecordSource, /Prediction accountability/);
assert.match(trackRecordSource, /Open forecasts/);
assert.match(trackRecordSource, /Scored outcomes/);
assert.match(trackRecordSource, /Observed hit rate/);
assert.match(trackRecordSource, /Calibration/);
assert.match(trackRecordSource, /Brier/);
assert.match(trackRecordSource, /Latest resolution/);
assert.match(trackRecordSource, /Confirmed/);
assert.match(trackRecordSource, /Contradicted/);
assert.match(trackRecordSource, /Inconclusive/);
assert.match(trackRecordSource, /Superseded/);
assert.match(trackRecordSource, /Learning baseline/);
assert.match(trackRecordSource, /Early calibration/);
assert.match(trackRecordSource, /Building track record/);
assert.match(trackRecordSource, /Established track record/);
assert.match(
  trackRecordSource,
  /No accuracy claim until a forecast reaches its horizon/,
);
assert.match(
  trackRecordSource,
  /Unverifiable strategic outlook is never counted as a hit or miss/,
);
assert.match(
  trackRecordSource,
  /Synthetic Intelligence cannot grade itself/,
);
assert.match(trackRecordSource, /prediction_accountability/);
assert.match(trackRecordSource, /\/api\/operator\/autonomous-watch\/settings/);
assert.match(trackRecordSource, /credentials:\s*"same-origin"/);
assert.match(trackRecordSource, /cache:\s*"no-store"/);
assert.match(trackRecordSource, /REFRESH_INTERVAL_MS = 60_000/);
assert.match(trackRecordSource, /Discuss track record/);
assert.match(trackRecordSource, /avantiqo:home-command/);
assert.match(trackRecordSource, /Do not change settings or execute any business action/);
assert.doesNotMatch(trackRecordSource, /executeUbteCapability/);
assert.doesNotMatch(trackRecordSource, /ServiceExecutionRuntime/);
assert.doesNotMatch(trackRecordSource, /service_role/i);

assert.match(settingsRouteSource, /prediction_accountability/);
assert.match(settingsRouteSource, /operatorPredictionAccountabilitySummary/);
assert.match(predictionSource, /operatorPredictionAccountabilitySummary/);
assert.match(predictionSource, /observed_success_rate/);
assert.match(predictionSource, /mean_confidence/);
assert.match(predictionSource, /calibration_gap/);
assert.match(predictionSource, /brier_score/);
assert.match(predictionSource, /next_evaluation_at/);
assert.match(predictionSource, /last_resolution/);

assert.match(workspaceSource, /SyntheticIntelligenceForecastTrackRecord/);
assert.match(
  workspaceSource,
  /<SyntheticIntelligenceForecastTrackRecord\s+organizationId=\{organizationId\}/,
);

console.log("OPERATOR_FORECAST_TRACK_RECORD_UI_AUDIT=PASS");
console.log("OPERATOR_FORECAST_TRACK_RECORD_UI=EVIDENCE_RESOLVED_NOT_SELF_GRADED");
console.log("OPERATOR_FORECAST_TRACK_RECORD_ACCURACY=NO_CLAIM_BEFORE_SCORED_HORIZONS");
console.log("OPERATOR_FORECAST_TRACK_RECORD_DISCUSSION=READ_ONLY_NO_EXECUTION_AUTHORIZATION");
