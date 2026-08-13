function text(value) {
  return String(value ?? "").trim();
}

const ACKNOWLEDGEMENTS = {
  en: ["I'm here.", "Go ahead.", "I'm with you.", "Ready."],
  de: ["Ich bin da.", "Nur zu.", "Ich höre zu.", "Bereit."],
  sv: ["Jag är här.", "Varsågod.", "Jag lyssnar.", "Redo."],
  fr: ["Je suis là.", "Allez-y.", "Je vous écoute.", "Prêt."],
  es: ["Estoy aquí.", "Adelante.", "Te escucho.", "Listo."],
  it: ["Sono qui.", "Dimmi pure.", "Ti ascolto.", "Pronto."],
  th: ["พร้อมแล้ว", "ว่ามาได้เลย", "กำลังฟังอยู่", "อยู่นี่แล้ว"],
};

function languageFromLocale(locale) {
  const language = text(locale).toLowerCase().split(/[-_]/)[0];
  return ACKNOWLEDGEMENTS[language] ? language : "en";
}

function nextAcknowledgement(language, previousAcknowledgement) {
  const phrases = ACKNOWLEDGEMENTS[language] || ACKNOWLEDGEMENTS.en;
  const previous = text(previousAcknowledgement).toLowerCase();
  const previousIndex = phrases.findIndex(
    (phrase) => phrase.toLowerCase() === previous,
  );
  return phrases[(previousIndex + 1 + phrases.length) % phrases.length];
}

export async function generateOperatorVoiceAcknowledgement({
  organizationId,
  partyId,
  locale = null,
  previousAcknowledgement = null,
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");

  const language = languageFromLocale(locale);
  return {
    acknowledgement: nextAcknowledgement(language, previousAcknowledgement),
    language,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "instant-acknowledgement-v1",
      usage_id: null,
    },
  };
}
