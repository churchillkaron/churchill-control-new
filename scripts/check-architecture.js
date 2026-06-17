import fs from "fs";
import path from "path";
import { enforceNoClientSupabase } from "../lib/shared/architecture/enforceNoClientSupabase.js";

function scan(dir) {

  const files = fs.readdirSync(dir);

  for (const file of files) {

    const full = path.join(dir, file);

    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      scan(full);
    } else if (file.endsWith(".jsx") || file.endsWith(".js")) {

      const content = fs.readFileSync(full, "utf8");

      enforceNoClientSupabase(full, content);

    }

  }

}

try {

  scan("app");

  console.log("✅ ARCHITECTURE CLEAN");

} catch (err) {

  console.error("❌ ARCHITECTURE FAILED");
  console.error(err.message);

  process.exit(1);

}
