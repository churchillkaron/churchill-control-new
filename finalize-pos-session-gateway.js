const fs = require("fs");

function fix(file, map) {
  let content = fs.readFileSync(file, "utf8");

  for (const [from, to] of map) {
    content = content.replace(new RegExp(from, "g"), to);
  }

  fs.writeFileSync(file, content);
  console.log("fixed:", file);
}

// FORCE FULL GATEWAY USAGE ONLY

fix("lib/pos/payments/loadPaymentState.js", [
  ["@/lib/restaurant/session/GetActiveSession/execute", "@/lib/restaurant/session/gateway"]
]);

fix("lib/pos/mergeTables.js", [
  ["@/lib/restaurant/session/MoveGuests/execute", "@/lib/restaurant/session/gateway"]
]);

fix("lib/pos/orders/autoCloseOrder.js", [
  ["@/lib/restaurant/session/CloseSession/execute", "@/lib/restaurant/session/gateway"]
]);

console.log("SESSION GATEWAY FULL LOCK COMPLETE");
