function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DIRECT_EXECUTE = new Set([
  "yes",
  "yes please",
  "yeah",
  "yep",
  "ok",
  "okay",
  "sure",
  "confirm",
  "confirmed",
  "proceed",
  "do it",
  "go ahead",
  "yes do it",
  "i agree do it",
  "agreed do it",
  "sounds good do it",
  "yes proceed",
  "yes go ahead",
  "please do it",
  "do that",
  "do this",
  "lets do it",
  "let us do it",
  "go ahead with it",
  "go ahead with that",
  "proceed with it",
  "proceed with that",
  "make it happen",
  "i agree",
  "agreed",
  "jag haller med",
  "ich stimme zu",
  "d accord",
  "de acuerdo",
  "ja",
  "oui",
  "si",
  "ตกลง",
  "ใช่",
  "ยืนยัน",
]);

const RECOMMENDATION_EXECUTE = new Set([
  "yes do it",
  "i agree do it",
  "agreed do it",
  "sounds good do it",
  "yes proceed",
  "yes go ahead",
  "please do it",
  "do it",
  "do that",
  "do this",
  "lets do it",
  "let us do it",
  "go ahead",
  "go ahead with it",
  "go ahead with that",
  "proceed",
  "proceed with it",
  "proceed with that",
  "make it happen",
  "execute it",
  "execute that",
  "gor det",
  "kor",
  "kor pa",
  "gor det nu",
  "mach es",
  "mach das",
  "fais le",
  "vas y",
  "hazlo",
  "adelante",
  "ทำเลย",
  "ดำเนินการ",
]);

const RECOMMENDATION_AGREE = new Set([
  "yes",
  "yes please",
  "yeah",
  "yep",
  "i agree",
  "agreed",
  "that makes sense",
  "sounds good",
  "good idea",
  "i like that",
  "i like it",
  "that works for me",
  "im good with that",
  "i am good with that",
  "lets go with that",
  "let us go with that",
  "lets use that approach",
  "let us use that approach",
  "jag haller med",
  "later bra",
  "bra ide",
  "ich stimme zu",
  "klingt gut",
  "d accord",
  "bonne idee",
  "de acuerdo",
  "buena idea",
  "ja",
  "oui",
  "si",
  "ตกลง",
  "ใช่",
]);

const REJECT = new Set([
  "no",
  "no thanks",
  "nope",
  "dont do it",
  "do not do it",
  "dont do that",
  "do not do that",
  "cancel",
  "cancel it",
  "cancel that",
  "stop",
  "stop it",
  "stop that",
  "leave it",
  "forget it",
  "nein",
  "nej",
  "non",
  "ไม่",
  "ยกเลิก",
]);

const LOCALIZED_RESUME = new Set([
  "fortsatt",
  "fortsatt nu",
  "fortsatt dar vi slutade",
  "weiter",
  "mach weiter",
  "weitermachen",
  "fortsetzen",
  "weiter wo wir aufgehort haben",
  "reprends",
  "reprends la ou nous nous sommes arretes",
  "continua",
  "reanuda",
  "continua desde donde paramos",
  "ทำต่อ",
  "ทำต่อเลย",
  "ดำเนินการต่อ",
]);

const RESUME = new Set([
  "continue",
  "continue now",
  "next",
  "next step",
  "resume",
  "resume now",
  "carry on",
  "keep going",
  "go on",
  "continue from there",
  "resume from there",
  "its approved",
  "it is approved",
  "its approved continue",
  "it is approved continue",
  "approved continue",
  ...LOCALIZED_RESUME,
]);

export function classifyPendingOperatorReply({
  message,
  pending = false,
  recommendation = false,
} = {}) {
  const clean = normalized(message);
  if (!clean) return null;

  // Exact localized resume phrases are allowed to reach the existing governed
  // resume path even when the durable pending projection is already missing.
  // That lets the runtime truthfully report an orphaned run instead of treating
  // the phrase as a new request. It does not authorize execution by itself.
  if (!pending) {
    return LOCALIZED_RESUME.has(clean) ? "resume" : null;
  }

  if (REJECT.has(clean)) return "reject";

  // When a recommendation is already represented by the exact pending
  // capability, human continuation language means execute that recommendation.
  // For a paused durable mission with no recommendation, the same language
  // remains a mission resume and preserves its stored verification/approval state.
  if (recommendation) {
    if (RECOMMENDATION_EXECUTE.has(clean) || RESUME.has(clean)) return "execute";
    if (RECOMMENDATION_AGREE.has(clean)) return "agree";
    return null;
  }

  if (RESUME.has(clean)) return "resume";
  return DIRECT_EXECUTE.has(clean) ? "execute" : null;
}

export default classifyPendingOperatorReply;
