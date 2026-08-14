// The advertising filler this platform refuses to ship, in one place.
//
// This list previously lived only in the benchmark scorer, which meant filler was punished but never
// rejected. A plan saying "seamlessly integrated mix" passed the validator, because GENERIC_DIRECTION
// only matches a whole field that is a placeholder -- n/a, tbd, "premium and authentic" -- and passed
// the decision gate, which never looked. It then lost 21 points at scoring and failed outright, with
// the repair loop never told a thing.
//
// That is why telling the director not to use these words failed twice. Disclosure was added and it
// answered with "seamless" three times; a concrete replacement was added and it answered with
// "seamlessly" twice plus "premium experience". Nothing in the pipeline ever rejected the plan, so
// nothing ever asked it to try again. The repair paths work when the gate names the problem, and this
// was never named.
//
// One list, consumed by three places: the contract that discloses it, the decision gate that rejects
// it, and the benchmark that scores it. It lives in the director registry rather than the benchmark so
// the dependency runs the right way -- the benchmark measures the studio's standard, it does not define
// it.

export const CREATIVE_ADVERTISING_FILLER = Object.freeze([
  { id: "elevate_your", phrase: "elevate your", pattern: /\belevate your\b/ },
  {
    id: "unforgettable_experience",
    phrase: "unforgettable experience",
    pattern: /\bunforgettable experience\b/,
  },
  {
    // The cliché is the tagline form, "Where luxury meets convenience", which sits at the head of a
    // clause. Unanchored, this matched craft description: "a shot list where camera movement meets the
    // beat", "framing where the bar rail meets the window light".
    id: "where_x_meets_y",
    phrase: "the tagline form where X meets Y",
    pattern: /(?:^|[.!?;]\s+|["'“])where \w+(?: \w+){0,3} meets \w+/,
  },
  { id: "more_than_just", phrase: "more than just", pattern: /\bmore than just\b/ },
  {
    id: "discover_the_difference",
    phrase: "discover the difference",
    pattern: /\bdiscover the difference\b/,
  },
  { id: "unlock_potential", phrase: "unlock potential", pattern: /\bunlock .* potential\b/ },
  {
    // redefine(?:d|s|ing)? could never match "redefining": the stem drops its e, so the commonest
    // advertising form of the word slipped through untouched.
    id: "redefine",
    phrase: "redefine in any form",
    pattern: /\bredefin(?:e|ed|es|ing)\b/,
  },
  {
    // "journey" alone caught ordinary strategy language -- audience journey, customer journey -- which
    // are the correct terms for what they describe. The cliché is the possessive and the promise.
    id: "journey",
    phrase: "your or their journey and journey begins",
    pattern: /\b(?:your|our|their) journey\b|\bjourney (?:begins|starts|awaits|continues)\b/,
  },
  { id: "premium_experience", phrase: "premium experience", pattern: /\bpremium experience\b/ },
  { id: "seamless", phrase: "seamless or seamlessly", pattern: /\bseamless(?:ly)?\b/ },
  {
    id: "innovative_solutions",
    phrase: "innovative solutions",
    pattern: /\binnovative solutions?\b/,
  },
  { id: "cutting_edge", phrase: "cutting-edge", pattern: /\bcutting[- ]edge\b/ },
  { id: "game_changer", phrase: "game-changer", pattern: /\bgame[- ]changer\b/ },
  { id: "transform_your", phrase: "transform your", pattern: /\btransform your\b/ },
]);

// The disclosure the contract shows the director, derived from the list rather than written beside it,
// so the two cannot drift apart.
export function advertisingFillerDisclosure() {
  return CREATIVE_ADVERTISING_FILLER.map((entry) => entry.phrase).join(", ");
}

// Which filler a piece of direction contains. A fresh global regex is built per call: the stored
// patterns are deliberately non-global so nothing shares lastIndex between callers.
export function advertisingFillerHits(value) {
  const text = String(value ?? "").toLowerCase();
  if (!text) return [];

  return CREATIVE_ADVERTISING_FILLER.flatMap((entry) => {
    const matches = text.match(new RegExp(entry.pattern.source, "g")) || [];
    return matches.length
      ? [{ id: entry.id, count: matches.length, example: String(matches[0]).slice(0, 90) }]
      : [];
  });
}

export default CREATIVE_ADVERTISING_FILLER;
