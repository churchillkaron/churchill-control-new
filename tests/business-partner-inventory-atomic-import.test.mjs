import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("Supply Chain owns atomic inventory import capability", async () => {
  const [registry, runtime, capability] = await Promise.all([
    read("lib/ubte/runtime/domains/DomainRuntimeRegistry.js"),
    read("lib/inventory/runtime/InventoryDomainRuntime.js"),
    read("lib/inventory/runtime/InventoryOperatorCapability.js"),
  ]);
  assert.match(registry, /"supply-chain": async/);
  assert.match(runtime, /inventory_items/);
  assert.match(capability, /operatorRequiresConfirmation: true/);
  assert.match(capability, /import_inventory_items_atomic/);
  assert.match(capability, /INVENTORY_IMPORT_ACTOR_MISMATCH/);
});

test("database importer is entity-bound duplicate-safe and does not overwrite", async () => {
  const sql = await read("supabase/migrations/20260910113000_inventory_item_atomic_bulk_import.sql");
  assert.match(sql, /INVENTORY_IMPORT_ENTITY_SCOPE_MISMATCH/);
  assert.match(sql, /lock table public\.inventory_items in share row exclusive mode/);
  assert.match(sql, /INVENTORY_IMPORT_DUPLICATE_CODE_IN_PAYLOAD/);
  assert.match(sql, /INVENTORY_IMPORT_AMBIGUOUS_EXISTING_CODE/);
  assert.match(sql, /where not exists/);
  assert.doesNotMatch(sql, /update public\.inventory_items/i);
  assert.match(sql, /grant execute .* service_role/);
});

test("prepared inventory reflex stages only NEW rows", async () => {
  const source = await read("lib/operator/runtime/OperatorPreparedAttachmentReflex.js");
  assert.match(source, /supply-chain\.inventory_items\.import/);
  assert.match(source, /disposition === "NEW"/);
  assert.match(source, /Existing item codes will be left unchanged/);
  assert.match(source, /PREPARED_INVENTORY_ITEM_ATOMIC_IMPORT/);
});
