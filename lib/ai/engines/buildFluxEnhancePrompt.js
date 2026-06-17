export function buildFluxEnhancePrompt({

  businessProfile,

  venue,

  mood,

  atmosphere,

  campaignType,

  assetAnalysis,

  extraDirection,

  basePrompt,

}) {

  return `

Commercial image enhancement aligned with the business profile.

Preserve the original real image.
Maintain realism and architectural accuracy.

Enhance:

- cinematic commercial lighting
- brand-appropriate atmosphere
- reflections
- premium color grading
- sharpness
- depth
- visual hierarchy
- high-end social media presentation

Venue:
${venue || "Business Location"}

Mood:
${mood || "Professional"}

Atmosphere:
${atmosphere || "Brand Appropriate"}

Campaign Type:
${campaignType || "Marketing Campaign"}

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

Industries:
${(businessProfile?.industries || []).join(", ")}

Business Types:
${(businessProfile?.business_types || []).join(", ")}

Revenue Drivers:
${(businessProfile?.revenue_drivers || []).join(", ")}

Marketing Angles:
${(businessProfile?.marketing_angles || []).join(", ")}

Visual Goal:

Create a professional commercial marketing image aligned with:

- the business profile
- the industry context
- customer motivations
- revenue drivers
- marketing strategy

Suitable for:

- Meta ads
- Instagram
- Facebook
- website marketing
- commercial campaigns
- business branding

`;

}