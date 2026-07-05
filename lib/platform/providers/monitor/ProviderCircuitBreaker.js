const failures = new Map();

const OPEN_AFTER = 5;
const RESET_AFTER_MS = 5 * 60 * 1000;

export const ProviderCircuitBreaker = {

  allow(providerId) {

    const state =
      failures.get(providerId);

    if (!state)
      return true;

    if (
      state.count <
      OPEN_AFTER
    )
      return true;

    if (
      Date.now() - state.last_failure >
      RESET_AFTER_MS
    ) {

      failures.delete(
        providerId,
      );

      return true;

    }

    return false;

  },

  success(providerId) {

    failures.delete(
      providerId,
    );

  },

  failure(providerId) {

    const state =
      failures.get(
        providerId,
      ) || {

        count: 0,

      };

    state.count++;

    state.last_failure =
      Date.now();

    failures.set(
      providerId,
      state,
    );

  },

  list() {

    return Array.from(
      failures.entries(),
    ).map(

      ([id,value]) => ({

        id,

        ...value,

      }),

    );

  },

};
