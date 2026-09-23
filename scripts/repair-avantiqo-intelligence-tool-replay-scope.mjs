#!/usr/bin/env node
const result = {
  success: false,
  error: "AVANTIQO_INTELLIGENCE_LEGACY_SOURCE_REPAIR_DISABLED",
  source_mutation_allowed: false,
  git_commit_allowed: false,
  git_push_allowed: false,
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY",
};
console.error(JSON.stringify(result));
process.exitCode = 2;
