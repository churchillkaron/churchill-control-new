export function buildPrompt(state) {

  return `
Create a realistic cinematic hospitality photograph.

CAMPAIGN:
${state.campaignType}

MOOD:
${state.mood}

LIGHTING:
${state.lighting}

COMPOSITION:
${state.composition}

ATMOSPHERE:
${state.atmosphere}

SUBJECT:
${state.subject}

VENUE:
${state.venue}

EXTRA DIRECTION:
${state.extraDirection}

RULES:
- realistic photography
- cinematic realism
- believable guests
- natural skin texture
- premium hospitality atmosphere
- authentic lighting
- no typography
- no logos
- no graphic design
`;
}