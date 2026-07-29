import BaseLookupProvider from "../BaseLookupProvider";

const ACCOUNT_TYPES = Object.freeze([
  Object.freeze({ value: "ASSET", label: "Asset" }),
  Object.freeze({ value: "LIABILITY", label: "Liability" }),
  Object.freeze({ value: "EQUITY", label: "Equity" }),
  Object.freeze({ value: "REVENUE", label: "Revenue" }),
  Object.freeze({ value: "EXPENSE", label: "Expense" }),
]);

class AccountTypeLookup extends BaseLookupProvider {
  async getOptions() {
    return ACCOUNT_TYPES.map((option) => ({ ...option }));
  }

  async search({ query = "" }) {
    const q = String(query || "").trim().toLowerCase();

    return ACCOUNT_TYPES
      .filter(
        (option) =>
          option.label.toLowerCase().includes(q) ||
          option.value.toLowerCase().includes(q)
      )
      .map((option) => ({ ...option }));
  }
}

export default new AccountTypeLookup();
