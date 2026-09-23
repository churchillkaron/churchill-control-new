import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const staffLayout = fs.readFileSync(new URL("../app/(system)/staff/layout.jsx", import.meta.url), "utf8");
const staffHome = fs.readFileSync(new URL("../app/(system)/staff/page.jsx", import.meta.url), "utf8");
const myDay = fs.readFileSync(new URL("../app/(system)/staff/my-day/page.jsx", import.meta.url), "utf8");
const customer = fs.readFileSync(new URL("../app/customer-portal/page.jsx", import.meta.url), "utf8");

test("staff portal has a phone-first bottom navigation and mobile work menu", () => {
  assert.match(staffLayout, /Staff mobile navigation/);
  assert.match(staffLayout, /fixed inset-x-3 bottom-3/);
  assert.match(staffLayout, /lg:hidden/);
  assert.match(staffLayout, /mobileMenuOpen/);
  assert.match(staffLayout, /firstOperational \|\| standardByKey\.get\("my-day"\)/);
});

test("staff home prioritizes thumb-sized shift action on phones", () => {
  assert.match(staffHome, /h-14 w-full/);
  assert.match(staffHome, /rounded-2xl/);
  assert.match(staffHome, /hidden h-12[\s\S]*sm:flex/);
  assert.match(staffHome, /className="hidden[^"]*lg:block/);
});

test("My Day completion workflow cannot force narrow phones into horizontal layout", () => {
  assert.doesNotMatch(myDay, /className="grid min-w-64 gap-2/);
  assert.match(myDay, /w-full[\s\S]*lg:min-w-64/);
  assert.match(myDay, /h-12 w-full[\s\S]*sm:w-auto/);
  assert.match(myDay, /capture="environment"/);
});

test("customer portal has phone bottom navigation and top mobile booking-wallet summary", () => {
  assert.match(customer, /Customer mobile navigation/);
  assert.match(customer, /fixed inset-x-3 bottom-3/);
  assert.match(customer, /href: "#bookings"/);
  assert.match(customer, /href: "#payments"/);
  assert.match(customer, /href: "#messages"/);
  assert.match(customer, /href: "#account"/);
  assert.match(customer, /md:hidden/);
  assert.match(customer, /data\.wallet\?\.balances\?\.\[0\]/);
});
