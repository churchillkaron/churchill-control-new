import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [conversationSource, syntheticSource, predictionSource] = await Promise.all([
  readFile("lib/operator/runtime/OperatorForecastConversationRuntime.js", "utf8"),
  readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8"),
  readFile("lib/operator/contracts/OperatorPredictionAccountability.js", "utf8"),
]);

assert.match(conversationSource, /isForecastAccountabilityQuestion/);
assert.match(conversationSource, /forecastAccountabilityReply/);
assert.match(conversationSource, /forecastAccountabilityContext/);
assert.match(conversationSource, /normalizeOperatorPredictionAccountability/);
assert.match(conversationSource, /operatorPredictionAccountabilitySummary/);
assert.match(conversationSource, /how accurate/i);
assert.match(conversationSource, /what did you get wrong/i);
assert.match(conversationSource, /what did you get right/i);
assert.match(conversationSource, /overconfident/);
assert.match(conversationSource, /underconfident/);
assert.match(conversationSource, /Brier score is/);
assert.match(conversationSource, /lower is better/);
assert.match(conversationSource, /too small a sample for a strong calibration claim/);
assert.match(conversationSource, /sample is still small/);
assert.match(conversationSource, /do not have enough resolved scored forecasts to claim an accuracy rate yet/);
assert.match(conversationSource, /only count a forecast after its evaluation horizon is reached/);
assert.match(conversationSource, /historical_forecast_accountability_only/);
assert.match(conversationSource, /not_live_business_proof:\s*true/);
assert.match(conversationSource, /mean_confidence/);
assert.match(conversationSource, /observed_success_rate/);
assert.match(conversationSource, /confidence - hitRate/);
assert.match(conversationSource, /function numericOrNull/);
assert.match(conversationSource, /value === null \|\| value === undefined \|\| value === ""/);
assert.match(conversationSource, /hitRate === null \|\| confidence === null/);
assert.match(conversationSource, /not enough confidence data to judge calibration yet/);
assert.match(conversationSource, /Mean stated confidence is not available yet, so I will not claim calibration/);
assert.match(conversationSource, /observed success-rate metric is not available yet/);
assert.doesNotMatch(conversationSource, /const hitRate = Number\(summary\?\.observed_success_rate\)/);
assert.doesNotMatch(conversationSource, /const confidence = Number\(summary\?\.mean_confidence\)/);
assert.doesNotMatch(conversationSource, /ServiceExecutionRuntime/);
assert.doesNotMatch(conversationSource, /executeUbteCapability/);
assert.doesNotMatch(conversationSource, /executeProvider/);
assert.doesNotMatch(conversationSource, /supabaseAdmin/);
assert.doesNotMatch(conversationSource, /WalletRuntime/);

assert.match(syntheticSource, /OperatorForecastConversationRuntime/);
assert.match(syntheticSource, /isForecastAccountabilityQuestion\(options\.message\)/);
assert.match(syntheticSource, /localForecastAccountabilityTurn/);
assert.match(syntheticSource, /forecast-accountability-local-v1/);
assert.match(syntheticSource, /provider:\s*"avantiqo-local"/);
assert.match(syntheticSource, /usage_id:\s*null/);
assert.match(syntheticSource, /bypassed_for_forecast_accountability:\s*true/);
assert.match(syntheticSource, /historical_accountability_only:\s*true/);
assert.match(syntheticSource, /owned_brief_used:\s*false/);
assert.match(syntheticSource, /live_evidence_used:\s*false/);
assert.match(syntheticSource, /forecast_accountability_local:\s*true/);
assert.match(syntheticSource, /execution:\s*null/);
assert.match(syntheticSource, /navigation:\s*null/);

const localGateIndex = syntheticSource.indexOf("isForecastAccountabilityQuestion(options.message)");
const cognitiveBriefIndex = syntheticSource.indexOf("const cognitiveBrief = await ownedCognitiveBrief(options)");
assert.ok(localGateIndex >= 0, "Forecast accountability gate must exist");
assert.ok(cognitiveBriefIndex >= 0, "Owned cognitive brief call must exist");
assert.ok(
  localGateIndex < cognitiveBriefIndex,
  "Forecast accountability must short-circuit before any owned cognitive brief call",
);

assert.match(predictionSource, /operatorPredictionAccountabilitySummary/);
assert.match(predictionSource, /scored_resolved/);
assert.match(predictionSource, /confirmed/);
assert.match(predictionSource, /contradicted/);
assert.match(predictionSource, /inconclusive/);
assert.match(predictionSource, /superseded/);
assert.match(predictionSource, /observed_success_rate/);
assert.match(predictionSource, /mean_confidence/);
assert.match(predictionSource, /calibration_gap/);
assert.match(predictionSource, /brier_score/);

console.log("OPERATOR_FORECAST_CONVERSATION_AUDIT=PASS");
console.log("OPERATOR_FORECAST_CONVERSATION=TEXT_AND_VOICE_LOCAL_ACCOUNTABILITY");
console.log("OPERATOR_FORECAST_CONVERSATION_AI_CALL=ZERO_FOR_MATCHED_ACCOUNTABILITY");
console.log("OPERATOR_FORECAST_CONVERSATION_ACCURACY=NO_CLAIM_BEFORE_SCORED_HORIZONS");
console.log("OPERATOR_FORECAST_CONVERSATION_NULL_METRICS=NEVER_COERCED_TO_ZERO");
console.log("OPERATOR_FORECAST_CONVERSATION_EVIDENCE=HISTORICAL_ACCOUNTABILITY_NOT_LIVE_PROOF");
console.log("OPERATOR_FORECAST_CONVERSATION_EXECUTION=NONE");
