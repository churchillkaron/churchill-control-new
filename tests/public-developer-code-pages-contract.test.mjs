import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const read = (path) => fs.readFile(new URL(path, `file://${root}/`), "utf8");

const [
  developersPage,
  developerHero,
  codeRoute,
  codePage,
  codeHero,
] = await Promise.all([
  read("app/developers/page.jsx"),
  read("components/public/DeveloperPlatformHeroArt.jsx"),
  read("app/code/page.jsx"),
  read("components/public/CodeStudioPublicPage.jsx"),
  read("components/public/CodeStudioHeroArt.jsx"),
]);

test("public developers page presents the real developer control plane", () => {
  assert.match(developersPage, /Build software on the business system Avantiqo already governs/);
  assert.match(developersPage, /THE DEVELOPER CONTROL PLANE/);
  assert.match(developersPage, /Capability contracts/);
  assert.match(developersPage, /Machine identity/);
  assert.match(developersPage, /Signed events/);
  assert.match(developersPage, /Observability/);
  assert.match(developersPage, /Usage & economics/);
  assert.match(developersPage, /GOVERNED BUSINESS CONTEXT/);
  assert.doesNotMatch(developersPage, /developer-work\.jpg/);
  assert.doesNotMatch(developersPage, /Sandbox/);
  assert.match(developersPage, /Need Avantiqo to build it\? Code Studio/);
  assert.match(developersPage, /governed capability contracts, scoped machine credentials/);
});

test("public developer hero visualizes environments credentials api webhooks and evidence", () => {
  assert.match(developerHero, /Organization-scoped developer control plane/);
  assert.match(developerHero, /API Explorer/);
  assert.match(developerHero, /Machine identity/);
  assert.match(developerHero, /Webhooks/);
  assert.match(developerHero, /Usage & health/);
  assert.match(developerHero, /organization scope bound/);
  assert.match(developerHero, /capability authority verified/);
  assert.match(developerHero, /request evidence recorded/);
});

test("public code page presents one studio across talk code preview and changes", () => {
  assert.match(codePage, /Talk about the product\. See it\. Build it\. Verify it\./);
  assert.match(codePage, /ONE STUDIO · FOUR VIEWS/);
  assert.match(codePage, /The conversation does not disappear when the coding starts/);
  assert.match(codePage, /NATURAL HANDOFF/);
  assert.match(codePage, /VISUAL INTELLIGENCE/);
  assert.match(codePage, /build this/);
  assert.match(codePage, /same project session/);
  assert.match(codePage, /Build on Avantiqo instead\? Developers/);
  assert.match(codeRoute, /Talk through product ideas, research and visual conclusions/);
});

test("public code hero visualizes the actual studio workflow", () => {
  assert.match(codeHero, /Talk/);
  assert.match(codeHero, /Code/);
  assert.match(codeHero, /Preview/);
  assert.match(codeHero, /Changes/);
  assert.match(codeHero, /Visual conclusion/);
  assert.match(codeHero, /Open in Code/);
  assert.match(codeHero, /Build this/);
  assert.match(codeHero, /LIVE REPOSITORY/);
  assert.match(codeHero, /conversation \+ schema \+ repo/);
  assert.match(codeHero, /Product architecture/);
  assert.match(codeHero, /Frontend/);
  assert.match(codeHero, /Contracts \+ data flow/);
  assert.doesNotMatch(codeHero, /Staff Portal|Identity & Security|passport|work permit/i);
});

test("public product hero art has explicit mobile collapse behavior", () => {
  assert.match(developerHero, /sm:min-h-\[575px\]/);
  assert.match(developerHero, /hidden border-r[\s\S]*sm:block/);
  assert.match(codeHero, /sm:min-h-\[590px\]/);
  assert.match(codeHero, /hidden border-l[\s\S]*sm:block/);
});

test("public Developers page explains external developer authority separately from employee identity", () => {
  assert.match(developersPage, /external developers join through organization-scoped Developer Portal invitations/);
  assert.match(developersPage, /developer identity is separate from employee identity/);
  assert.doesNotMatch(developersPage, /authenticated staff identity remain connected/);
});

test("portal artwork reflects the live Supplier Network entry model without exposing private transaction detail", async () => {
  const products = await read("components/public/ProductsCatalogPage.jsx");
  assert.match(products, /Invitations · free shop · Supplier Network · Business upgrade/);
  assert.match(products, /"\/supplier-portal"/);
  assert.doesNotMatch(products, /POs · delivery · invoices · payment status/);
  assert.doesNotMatch(products, /"\/products\/supplier-portal"/);
});
