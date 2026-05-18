export default async function calculateAIScore({
  learning,
}) {

  try {

    const adaptiveScore =
      Number(
        learning.adaptive_score || 0
      );

    let grade =
      "C";

    if (
      adaptiveScore > 500
    ) {

      grade = "A";

    } else if (
      adaptiveScore > 250
    ) {

      grade = "B";
    }

    return {

      success: true,

      ai_score:
        adaptiveScore,

      ai_grade:
        grade,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
