/**
 * ARCHITECTURE GUARD
 * Prevents UI from directly accessing Supabase client
 */

const fs = require("fs");
const path = require("path");

const VIOLATION_PATTERN =
  "@/lib/shared/supabase/client";

function scan(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      if (file === "node_modules") continue;
      scan(fullPath);
    } else if (file.endsWith(".js") || file.endsWith(".jsx")) {
      const content = fs.readFileSync(fullPath, "utf8");

      if (content.includes(VIOLATION_PATTERN)) {
        console.error(
          "🚨 ARCHITECTURE VIOLATION:",
          fullPath
        );
        process.exit(1);
      }
    }
  }
}

scan("app");
console.log("✅ Architecture clean");
