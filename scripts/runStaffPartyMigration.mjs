import { migrateStaffAccountsToParty } from "../lib/staff/migration/migrateStaffAccountsToParty.js";

const result = await migrateStaffAccountsToParty();

console.log(
  JSON.stringify(result, null, 2)
);
