import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const read = (path) => fs.readFile(new URL(path, `file://${root}/`), "utf8");

const [
  page,
  hero,
  catalog,
  header,
  workforceConfig,
  landing,
  codeHero,
] = await Promise.all([
  read("app/staff-portal/page.jsx"),
  read("components/public/StaffPortalHeroArt.jsx"),
  read("components/public/productCatalog.js"),
  read("components/public/PublicSiteHeader.jsx"),
  read("components/public/productConfigs.js"),
  read("components/public/ProductLandingPage.jsx"),
  read("components/public/CodeStudioHeroArt.jsx"),
]);

test("staff portal is a first-class public product route", () => {
  assert.match(page, /One staff portal\. One employee record\./);
  assert.match(page, /THE STAFF EXPERIENCE/);
  assert.match(page, /OWNER \/ HR CONTROL/);
  assert.match(page, /IDENTITY & SECURITY/);
  assert.match(page, /ONE RECORD · MANY WORKFLOWS/);
  assert.match(catalog, /id:"staff-portal"[\s\S]*href:"\/staff-portal"/);
  assert.match(header, /\["Staff Portal", "\/staff-portal"\]/);
});

test("staff portal explains employee and owner hr experiences separately", () => {
  assert.match(page, /The employee should not need six apps to understand their work/);
  assert.match(page, /See the person, the evidence and the business context together/);
  assert.match(page, /VISUAL REVIEW/);
  assert.match(page, /Owner\/HR/);
  assert.match(page, /Workforce control/);
  assert.match(page, /Payroll context/);
});

test("staff portal explains identity security without promising unsupported notifications", () => {
  assert.match(page, /Verified contact/);
  assert.match(page, /Passport or National ID/);
  assert.match(page, /Optional work permit/);
  assert.match(page, /Expiry visibility/);
  assert.match(page, /Restricted storage/);
  assert.match(page, /Role-aware access/);
  assert.doesNotMatch(page, /automatic email|automatic WhatsApp|push notification/i);
});

test("staff portal hero visualizes both staff and hr control", () => {
  assert.match(hero, /AVANTIQO STAFF PORTAL/);
  assert.match(hero, /Identity & security/);
  assert.match(hero, /Private documents/);
  assert.match(hero, /Owner \/ HR/);
  assert.match(hero, /Visual review/);
  assert.match(hero, /Expiry attention/);
  assert.match(hero, /One record/);
});

test("workforce and staff portal cross-link without mixing into code studio", () => {
  assert.match(workforceConfig, /Explore the Staff Portal/);
  assert.match(workforceConfig, /href: "\/staff-portal"/);
  assert.match(landing, /config\.related/);
  assert.doesNotMatch(codeHero, /Staff Portal|Passport|work permit|Owner \/ HR/i);
});
