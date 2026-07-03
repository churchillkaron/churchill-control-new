function groupByProblem(ideas, evaluations) {
  const byProblem = {};

  for (const idea of ideas) {
    if (!byProblem[idea.problem_id]) {
      byProblem[idea.problem_id] = [];
    }

    const evaluation =
      evaluations.find(
        (item) =>
          item.idea_id === idea.id
      );

    byProblem[idea.problem_id].push({
      idea,
      evaluation,
      score:
        evaluation?.weighted_score || 0,
    });
  }

  return byProblem;
}

export function selectCreativeDecisions({
  ideas,
  evaluations,
  maxPerProblem = 2,
}) {
  const grouped =
    groupByProblem(
      ideas,
      evaluations
    );

  const decisions = [];

  Object.keys(grouped).forEach(
    (problemId) => {
      const ranked =
        grouped[problemId]
          .filter(
            (item) =>
              item.evaluation
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      const selected =
        ranked.slice(0, maxPerProblem);

      selected.forEach(
        (item, index) => {
          decisions.push({
            id:
              `decision_${problemId}_${index + 1}`,
            problem_id:
              problemId,
            problem_type:
              item.idea.problem_type,
            selected_idea_id:
              item.idea.id,
            title:
              item.idea.title,
            description:
              item.idea.description,
            production_method:
              item.idea.production_method,
            required_assets:
              item.idea.required_assets,
            assumptions:
              item.idea.assumptions,
            risks: [
              ...item.idea.risks,
              ...(item.evaluation?.risks || []),
            ],
            scores:
              item.evaluation?.scores || {},
            weighted_score:
              item.score,
            reason:
              "Selected by Avantiqo Decision Engine from scored creative candidates.",
            status:
              "selected",
          });
        }
      );
    }
  );

  const totalScore =
    decisions.length
      ? Math.round(
          decisions.reduce(
            (sum, item) =>
              sum + item.weighted_score,
            0
          ) / decisions.length
        )
      : 0;

  return {
    decisions,
    confidence: totalScore,
  };
}
