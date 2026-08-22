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

const RESUME = new Set([
  "continue",
  "continue now",
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
]);

export function classifyPendingOperatorReply({
  message,
  pending = false,
  recommendation = false,
} = {}) {
  if (!pending) return null;
  const clean = normalized(message);
  if (!clean) return null;

  if (REJECT.has(clean)) return "reject";
  if (RESUME.has(clean)) return "resume";

  if (recommendation) {
    if (RECOMMENDATION_EXECUTE.has(clean)) return "execute";
    if (RECOMMENDATION_AGREE.has(clean)) return "agree";
    return null;
  }

  return DIRECT_EXECUTE.has(clean) ? "execute" : null;
}

export default classifyPendingOperatorReply;
