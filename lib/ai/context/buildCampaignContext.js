export async function buildCampaignContext({

  memory,

  selectedInteriorAssets,

  selectedStaffAssets,

  topAssets,

  businessProfile,

}) {

  // MEMORY CONTEXT

  const memoryContext =

    memory
      .map((memoryItem) => `

Mood:
${memoryItem.mood}

Lighting:
${memoryItem.lighting}

Composition:
${memoryItem.composition}

Atmosphere:
${memoryItem.atmosphere}

`)
      .join("\n");

  // INTERIOR CONTEXT

  const interiorContext =

    selectedInteriorAssets
      .map((asset) => `

Interior Reference:
${asset.file_url}

Description:
${asset.description}

Tags:
${(asset.tags || []).join(", ")}

`)
      .join("\n");

  // STAFF CONTEXT

  const staffContext =

    selectedStaffAssets
      .map((asset) => `

Staff Reference:
${asset.file_url}

Description:
${asset.description}

Tags:
${(asset.tags || []).join(", ")}

`)
      .join("\n");

  // TOP ASSET CONTEXT

  const topAssetContext =

    topAssets
      .map((asset) => `

Top Performing Asset:
${asset.file_url}

Description:
${asset.description}

Performance Score:
${asset.performance_score}

Tags:
${(asset.tags || []).join(", ")}

`)
      .join("\n");

  const businessDNA = "";

  return `

${businessDNA}

REFERENCE MEMORY:

${memoryContext}

VENUE REFERENCES:

${interiorContext}

STAFF REFERENCES:

${staffContext}

TOP PERFORMING VISUAL REFERENCES:

${topAssetContext}

IMPORTANT:

Maintain business realism.

Maintain venue consistency.

Maintain brand-appropriate commercial atmosphere.

Avoid generic stock photography.

Avoid inconsistent branding.

`;

}