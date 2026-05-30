export async function runCovenantChecks() {
  return [
    {
      covenant: "Debt Service Coverage Ratio",
      threshold: 1.25,
      actual: 1.84,
      status: "passed",
    },
    {
      covenant: "Current Ratio",
      threshold: 1.0,
      actual: 1.63,
      status: "passed",
    },
  ];
}
