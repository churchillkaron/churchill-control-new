export default async function buildCampaignCaption({
  venue,
  campaignType,
  mood,
  atmosphere,
  subject,
}) {

  return {
    caption: `
✨ ${venue}

${subject}

Experience the atmosphere tonight.

#PhuketNightlife
#${venue?.replace(/\s/g, "")}
    `.trim(),

    hashtags: [
      "#Phuket",
      "#Nightlife",
      "#BeachClub",
    ],

    cta:
      "Book your table now.",

    fullContent: `
✨ ${venue}

${subject}

Experience the atmosphere tonight.

Book your table now.

#PhuketNightlife
#${venue?.replace(/\s/g, "")}
    `.trim(),
  };

}