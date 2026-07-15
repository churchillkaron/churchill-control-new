import BaseLookupProvider from "../BaseLookupProvider";

const ACCOUNT_TYPES = [

  "Current Asset",
  "Non Current Asset",

  "Current Liability",
  "Non Current Liability",

  "Equity",

  "Revenue",
  "Other Revenue",

  "Cost of Sales",

  "Operating Expense",
  "Other Expense",

];

class AccountTypeLookup extends BaseLookupProvider {

  async getOptions() {

    return ACCOUNT_TYPES.map(
      value => ({

        value,

        label: value,

      })
    );

  }

  async search({

    query = "",

  }) {

    const q =
      query.toLowerCase();

    return ACCOUNT_TYPES

      .filter(
        value =>
          value
            .toLowerCase()
            .includes(q)
      )

      .map(
        value => ({

          value,

          label: value,

        })
      );

  }

}

export default new AccountTypeLookup();
