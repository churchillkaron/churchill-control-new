export async function buildResearchPlan(
  project,
  brief,
) {

  return [

    {
      id: "business",
      objective:
        "Understand the business.",
      required: true,
    },

    {
      id: "audience",
      objective:
        "Understand the audience.",
      required: true,
    },

    {
      id: "competition",
      objective:
        "Understand competitors.",
      required: true,
    },

    {
      id: "market",
      objective:
        "Understand market conditions.",
      required: true,
    },

    {
      id: "message",
      objective:
        "Find the strongest commercial message.",
      required: true,
    },

    {
      id: "creative_direction",
      objective:
        "Recommend the strongest creative direction.",
      required: true,
    },

  ];

}
