const fs = require("fs");
const path = require("path");

const root = "./lib";

function walk(dir, files = []) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walk(root);

const used = new Set();

function scan(dir) {
  const walkApp = (d) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walkApp(full);
      else {
        const content = fs.readFileSync(full, "utf-8");
        allFiles.forEach(file => {
          if (content.includes(file.replace("./", ""))) {
            used.add(file);
          }
        });
      }
    }
  };

  walkApp("./app");
  walkApp("./components");
}

scan("./app");
scan("./components");

console.log("=== UNUSED FILES ===");
allFiles.forEach(f => {
  if (!used.has(f)) console.log(f);
});
