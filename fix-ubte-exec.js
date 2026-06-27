const fs = require("fs");

const file = "lib/shared/ubte/executeTransaction.js";

let c = fs.readFileSync(file, "utf8");

c = c.replace(/tenant_id/g, "entity_id");

fs.writeFileSync(file, c);

console.log("UBTE EXECUTION FIXED");
