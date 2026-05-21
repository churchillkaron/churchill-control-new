export function buildFluxEnhancePrompt({

  venue,

  mood,

  atmosphere,

  campaignType,

  assetAnalysis,

  extraDirection,

  basePrompt,

}) {

  return `

Luxury hospitality image enhancement.

Preserve the original real image.
Maintain realism and architectural accuracy.

Enhance:

- cinematic hospitality lighting
- luxury atmosphere
- reflections
- premium color grading
- sharpness
- depth
- visual hierarchy
- high-end social media presentation

Venue:
${venue || "Luxury Hospitality Venue"}

Mood:
${mood || "Elegant"}

Atmosphere:
${atmosphere || "Premium"}

Campaign Type:
${campaignType || "Hospitality"}

Scene Analysis:
${JSON.stringify(
  assetAnalysis || {},
  null,
  2
)}

Base Campaign Prompt:
${basePrompt || ""}

Extra Direction:
${extraDirection || ""}

IMPORTANT RULES:

- preserve realism
- preserve original architecture
- preserve original venue identity
- preserve humans naturally if present
- no fake text
- no unrealistic AI distortion
- no over-stylization
- no fake objects
- no warped structures
- no cartoon appearance

Visual Goal:

Luxury premium hospitality marketing image suitable for:

- Instagram
- Meta ads
- luxury hospitality branding
- nightlife campaigns
- beach club marketing
- fine dining campaigns

`;

}