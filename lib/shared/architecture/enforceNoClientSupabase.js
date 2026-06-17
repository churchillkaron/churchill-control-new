/**
 * ARCHITECTURE GUARD
 * Prevents direct Supabase client usage in UI layer
 */

export function enforceNoClientSupabase(filePath, content) {

  const isUI =
    filePath.includes("app/(system)") ||
    filePath.includes("app/(workforce)") ||
    filePath.includes("app/page");

  if (!isUI) return;

  const forbiddenPatterns = [
    "@/lib/shared/supabase/client",
    "from(\"orders\"",
    "from(\"inventory\"",
    "from(\"payments\"",
    "from(\"invoices\"",
    "supabase.from("
  ];

  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      throw new Error(
        `ARCHITECTURE VIOLATION: ${filePath} uses forbidden DB access`
      );
    }
  }
}
