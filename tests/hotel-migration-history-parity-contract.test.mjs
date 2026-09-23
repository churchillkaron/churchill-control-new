import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const historicalVersions = [
  "20260905015253_hotel_group_room_blocks.sql",
  "20260905015850_hotel_group_offer_hot_path_indexes.sql",
  "20260905020719_hotel_atomic_inventory_guard.sql",
  "20260905022935_hotel_finance_settlement_bridge.sql",
  "20260905023640_hotel_gateway_payment_evidence.sql",
  "20260905023838_hotel_atomic_gateway_reconciliation.sql",
  "20260905024306_hotel_guest_party_atomic_linkage.sql",
  "20260905024338_hotel_existing_guest_party_backfill.sql",
  "20260905024900_hotel_finance_deposit_account_and_atomic_posting.sql",
  "20260905030021_hotel_atomic_gateway_refund_finance.sql",
  "20260905034652_hotel_ota_transport_reconciliation.sql",
  "20260905034918_hotel_ota_evidence_privilege_hardening.sql",
];

test("historical production-only Hotel migration versions stay represented locally", () => {
  for (const filename of historicalVersions) {
    const path = `supabase/migrations/${filename}`;
    assert.equal(fs.existsSync(path), true, `missing historical parity marker ${filename}`);
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /Historical production migration parity marker/);
    assert.match(source, /Intentionally no-op/);
    const executable = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    assert.deepEqual(executable, [], `${filename} must remain comment-only`);
  }
});
