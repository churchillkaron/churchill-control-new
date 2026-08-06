import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`RETAIL_OPERATIONS_AUDIT_FAIL: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail(`missing ${relativePath}`);
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(relativePath, expected) {
  const content = read(relativePath);

  if (!content.includes(expected)) {
    fail(`${relativePath} missing ${JSON.stringify(expected)}`);
  }
}

const retailControl =
  "app/(system)/workspace/[organizationId]/operations/retail/page.jsx";
const legacyRetail =
  "app/(system)/workspace/[organizationId]/retail/page.jsx";
const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";

requireText(retailControl, "/operations/pos");
requireText(retailControl, "/supply-chain/inventory");
requireText(retailControl, "/commercial/customers");
requireText(retailControl, "Operations owns selling");
requireText(retailControl, "Supply Chain owns stock");

requireText(legacyRetail, "redirect(");
requireText(legacyRetail, "/operations/retail");

requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/retail"
);
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/pos"
);
requireText(
  solutionRegistry,
  "/workspace/:organizationId/supply-chain/inventory"
);

if (
  read(solutionRegistry).includes(
    'route: "/workspace/:organizationId/retail"'
  )
) {
  fail("solution registry still contains the legacy Retail Control route");
}

if (!process.exitCode) {
  console.log("RETAIL_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("RETAIL_CONTROL_OWNER=OPERATIONS");
  console.log("RETAIL_SELLING_OWNER=UNIVERSAL_POS");
  console.log("RETAIL_INVENTORY_OWNER=SUPPLY_CHAIN");
  console.log("RETAIL_LEGACY_ROUTE=REDIRECT_ONLY");
}
