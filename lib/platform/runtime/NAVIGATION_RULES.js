/**
 * AVANTIQO OS NAVIGATION RULES
 */

export const NAVIGATION_RULES = {
  singleSourceOfTruth: "MODULE_REGISTRY",
  runtimeSource: "getAvantiqoNav",
  uiContract: "navigation must always be flat array",
  forbidden: [
    "Navbar.js",
    "static nav arrays",
    "moduleGroups.js"
  ]
};
