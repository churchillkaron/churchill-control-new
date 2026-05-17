export default async function buildRealtimeVoiceSession({
  tenant_id,
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
        "https://api.openai.com/v1/realtime/sessions",
        {

          method: "POST",

          headers: {

            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            model:
              "gpt-4o-realtime-preview-2024-12-17",

            voice:
              "alloy",

            instructions:
`You are Churchill AI realtime executive voice agent.

You operate:
- restaurant intelligence
- executive monitoring
- forecasting
- payroll intelligence
- operations analysis
- anomaly detection
- optimization

Always speak professionally and strategically.`,
          }),
        }
      );

    const json =
      await response.json();

    return {

      success: response.ok,

      session:
        json,

      raw:
        json,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
