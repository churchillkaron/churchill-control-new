import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  resolveOperatorInstantGreeting,
} = await import('../lib/operator/runtime/OperatorInstantGreetingPolicy.js');
const {
  resolvePreSemanticReadIntent,
} = await import('../lib/operator/runtime/OperatorPreSemanticReadRuntime.js');
const {
  readOperatorWeather,
} = await import('../lib/platform/research/runtime/OperatorWeatherRuntime.js');
const {
  readOperatorTime,
} = await import('../lib/platform/research/runtime/OperatorTimeRuntime.js');
const {
  operatorDirectEvidenceHumanResponse,
} = await import('../lib/operator/runtime/OperatorFastConversationRuntime.js');

const CONTRACT = 'AVANTIQO_BUSINESS_PARTNER_NATURAL_ACCEPTANCE_V1';
const assert = (value, code) => { if (!value) throw new Error(`${CONTRACT}_${code}`); };
const transcript = [];
const say = (role, content) => transcript.push({ role, content: String(content || '').trim() });

say('user', 'hi');
const greeting = resolveOperatorInstantGreeting({ message: 'hi', source: 'text' });
assert(greeting === "Hi. I'm here and ready.", 'GREETING');
say('assistant', greeting);

say('user', "how's the weather today");
const first = resolvePreSemanticReadIntent({ message: "how's the weather today" });
assert(first?.capability_key === 'platform.weather.read', 'WEATHER_CAPABILITY');
assert(first?.clarification_required === true, 'WEATHER_CLARIFICATION');
say('assistant', first.clarification_question);

say('user', 'mine');
const second = resolvePreSemanticReadIntent({
  message: 'mine',
  immediateConversation: [
    { role: 'assistant', content: first.clarification_question, clarification: {
      required: true,
      field_key: first.clarification_field,
      capability_key: first.capability_key,
      accepts_device_location: first.accepts_device_location === true,
    } },
    { role: 'user', content: 'mine' },
  ],
  deviceLocation: {
    latitude: 13.7563,
    longitude: 100.5018,
    accuracy_m: 120,
    captured_at: new Date().toISOString(),
  },
});
assert(second?.route === 'evidence', 'MINE_CONTINUATION');
assert(second?.goal_relation === 'continue', 'MINE_GOAL_RELATION');
assert(Number.isFinite(second?.capability_payload?.latitude), 'MINE_LATITUDE');
const weather = await readOperatorWeather({ payload: second.capability_payload });
assert(weather?.status === 'CURRENT_WEATHER', 'WEATHER_READ');
const weatherReply = operatorDirectEvidenceHumanResponse({
  capabilityKey: 'platform.weather.read',
  evidence: weather,
});
assert(weatherReply && /°C/.test(weatherReply), 'WEATHER_PRESENTATION');
assert(!/project context|not directly related|do not have access to real-time/i.test(weatherReply), 'WEATHER_BAD_FALLBACK');
say('assistant', weatherReply);

say('user', 'weather in Phuket today');
const third = resolvePreSemanticReadIntent({ message: 'weather in Phuket today' });
assert(third?.capability_key === 'platform.weather.read', 'PHUKET_CAPABILITY');
assert(third?.route === 'evidence', 'PHUKET_DIRECT_READ');
const phuket = await readOperatorWeather({ payload: third.capability_payload });
assert(phuket?.status === 'CURRENT_WEATHER', 'PHUKET_WEATHER_READ');
const phuketReply = operatorDirectEvidenceHumanResponse({ capabilityKey: 'platform.weather.read', evidence: phuket });
assert(phuketReply && /Phuket/i.test(phuketReply), 'PHUKET_PRESENTATION');
say('assistant', phuketReply);

say('user', 'what time is it in New York now?');
const timeIntent = resolvePreSemanticReadIntent({ message: 'what time is it in New York now?' });
assert(timeIntent?.capability_key === 'platform.time.read', 'TIME_CAPABILITY');
assert(timeIntent?.route === 'evidence', 'TIME_DIRECT_READ');
const timeEvidence = await readOperatorTime({ payload: timeIntent.capability_payload });
assert(timeEvidence?.status === 'CURRENT_TIME', 'TIME_READ');
const timeReply = operatorDirectEvidenceHumanResponse({ capabilityKey: 'platform.time.read', evidence: timeEvidence });
assert(timeReply && /New York/i.test(timeReply), 'TIME_PRESENTATION');
assert(!/project context|not directly related|do not have access/i.test(timeReply), 'TIME_BAD_FALLBACK');
say('assistant', timeReply);


console.log(JSON.stringify({ success: true, contract: CONTRACT, transcript }, null, 2));
console.log(`${CONTRACT}=PASS`);
