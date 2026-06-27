const fs = require("fs");
const path = require("path");

const files = [
  "lib/finance/accounts-receivable/createCustomerInvoice.js",
  "lib/finance/accounts-receivable/postCustomerPayment.js",
  "lib/finance/fixed-assets/createFixedAsset.js",
  "lib/finance/gl-posting/postVendorPaymentGL.js",
  "lib/finance/vendor-invoices/createVendorInvoice.js",
];

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  let content = fs.readFileSync(fullPath, "utf8");

  // Remove duplicate lines like: organization_id repeated twice in params
  content = content.replace(
    /organization_id,\s*organization_id,/g,
    "organization_id,"
  );

  // safety: remove any accidental triple duplicates
  content = content.replace(
    /organization_id,\s*organization_id/g,
    "organization_id"
  );

  fs.writeFileSync(fullPath, content);
  console.log("Fixed:", file);
}
