const fs = require("fs");
const path = require("path");

const ROOTS = ["app", "lib"];

const KEYWORDS = [
  "ai",
  "intelligence",
  "agent",
  "orchestration",
  "automation",
  "workflow",
  "runtime",
  "executive",
  "owner",
  "command",
  "dashboard",
  "realtime",
  "events",
  "approval",
  "procurement",
  "finance",
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }

  return files;
}

const allFiles = ROOTS.flatMap((root) => walk(root));

const groups = {};

for (const file of allFiles) {
  const lower = file.toLowerCase();

  for (const key of KEYWORDS) {
    if (lower.includes(key)) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    }
  }
}

console.log("\n=== DUPLICATE / OVERLAP AUDIT ===\n");

for (const key of KEYWORDS) {
  const files = groups[key] || [];

  if (files.length > 1) {
    console.log(`\n## ${key.toUpperCase()} (${files.length})`);
    files.forEach((file) => console.log(file));
  }
}

console.log("\n=== END AUDIT ===\n");
