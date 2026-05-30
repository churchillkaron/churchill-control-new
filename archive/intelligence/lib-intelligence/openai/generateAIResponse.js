export default async function generateAIResponse({
  systemPrompt,
  userPrompt,
  tools = [],
}) {

  try {

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {
        success: false,
        error:
          "OPENAI_API_KEY_MISSING",
      };
    }

    const response =
      await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model:
              "gpt-4.1",
            messages: [
              {
                role:
                  "system",
                content:
                  systemPrompt,
              },
              {
                role:
                  "user",
                content:
                  userPrompt,
              },
            ],
            tools,
            tool_choice:
              "auto",
            temperature:
              0.7,
          }),
        }
      );

    const json =
      await response.json();

    return {
      success: true,
      message:
        json?.choices?.[0]
          ?.message || {},
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
