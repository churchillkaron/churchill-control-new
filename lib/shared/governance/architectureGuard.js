export function architectureGuard({ source = "", target = "" }) {
  const violations = [];

  if (source.includes("lib/shared") && target.match(/lib\/(finance|pos|procurement|inventory|production)\//)) {
    violations.push("shared must not import domain logic");
  }

  if (source.includes("app/(system)") && target.includes("lib/shared/supabase/admin")) {
    violations.push("UI must not import supabase admin");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
