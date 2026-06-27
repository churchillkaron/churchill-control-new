const fs = require("fs");

function replace(file, replacements) {
  let content = fs.readFileSync(file, "utf8");

  replacements.forEach(([from, to]) => {
    content = content.replace(new RegExp(from, "g"), to);
  });

  fs.writeFileSync(file, content);
  console.log("fixed:", file);
}

// 1. reopenClosedOrder → use gateway open
replace("lib/pos/reopenClosedOrder.js", [
  ["import \\{ execute as openSession \\}.*", ""],
  ["openTableSession", "SessionGateway.open"],
]);

// 2. loadPaymentState → use gateway getLive
replace("lib/pos/payments/loadPaymentState.js", [
  ["getActiveTableSession", "SessionGateway.getLive"],
]);

// 3. mergeTables → gateway moveGuests
replace("lib/pos/mergeTables.js", [
  ["getActiveTableSession", "SessionGateway.getLive"],
  ["moveGuestsBetweenTables", "SessionGateway.moveGuests"],
]);

// 4. autoCloseOrder → gateway close session
replace("lib/pos/orders/autoCloseOrder.js", [
  ["closeTableSession", "SessionGateway.close"],
]);

console.log("DONE");
