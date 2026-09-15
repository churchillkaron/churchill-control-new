import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const renderer = fs.readFileSync(
  new URL("../lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf.js", import.meta.url),
  "utf8",
);
const brandResolver = fs.readFileSync(
  new URL("../lib/platform/documents/branding/BrandResolver.js", import.meta.url),
  "utf8",
);

test("customer invoice keeps seller and bill-to as aligned parallel columns", () => {
  assert.match(renderer, /const sellerX = left;/);
  assert.match(renderer, /const billToX = 310;/);
  assert.match(renderer, /const blockTop = 126;/);
  assert.match(renderer, /pdf\.text\("FROM", sellerX, labelY\)/);
  assert.match(renderer, /pdf\.text\("BILL TO", billToX, labelY\)/);
  assert.match(renderer, /pdf\.text\(text\(legal\.legal_name[^\n]+sellerX, nameY\)/);
  assert.match(renderer, /pdf\.text\(customerName\(document, context\), billToX, nameY\)/);
});

test("customer invoice uses a larger logo and wraps multiline party details", () => {
  assert.match(renderer, /pdf\.addImage\(brandLogo\.data, brandLogo\.format, left, 24, 118, 78/);
  assert.match(renderer, /function partyAddressLines/);
  assert.match(renderer, /splitTextToSize\(line, 220\)/);
  assert.match(renderer, /splitTextToSize\(line, 225\)/);
});

test("invoice payment details fall back to the canonical active finance bank account", () => {
  assert.match(brandResolver, /\.from\("bank_accounts"\)/);
  assert.match(brandResolver, /\.eq\("active", true\)/);
  assert.match(brandResolver, /\.order\("is_default", \{ ascending: false \}\)/);
  assert.match(brandResolver, /account_number: financeBank\.account_number/);
  assert.match(renderer, /BANK \/ PAYMENT DETAILS/);
});

test("invoice legal footer remains fixed to the physical page bottom", () => {
  assert.match(renderer, /Legal footer is fixed to the physical page bottom/);
  assert.match(renderer, /pdf\.line\(left, pageHeight - 62, right, pageHeight - 62\)/);
  assert.match(renderer, /pageHeight - 43/);
});
