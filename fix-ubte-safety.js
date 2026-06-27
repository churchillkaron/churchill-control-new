const fs = require("fs");

const file = "lib/shared/ubte/safety.js";

let c = fs.readFileSync(file, "utf8");

c = c.replace(/tenant_id/g, "entity_id");
c = c.replace(/UBTE: missing tenant_id/g, "UBTE: missing entity_id");

fs.writeFileSync(file, c);

console.log("UBTE SAFETY FIXED");
