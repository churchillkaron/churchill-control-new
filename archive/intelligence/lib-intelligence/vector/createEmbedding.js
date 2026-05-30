export default async function createEmbedding(
  text
) {

  try {

    if (!text) {

      return {
        success: false,
        error:
          "TEXT_REQUIRED",
      };
    }

    const embedding =
      Array.from(
        text
      ).map(
        (char) =>
          char.charCodeAt(0) / 255
      );

    return {
      success: true,
      embedding:
        embedding.slice(
          0,
          256
        ),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
