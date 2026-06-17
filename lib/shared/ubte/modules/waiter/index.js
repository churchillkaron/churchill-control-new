/**
 * UBTE WAITER CLIENT FACADE
 * Browser safe.
 * Talks only to API routes.
 */

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || data?.success === false) {
    throw new Error(
      data?.error || "Request failed"
    );
  }

  return data.data || data;
}

export function createWaiterModule() {
  async function openTable(params) {
    return post(
      "/api/pos/tables/open",
      params
    );
  }

  async function merge(params) {
    return post(
      "/api/pos/tables/merge",
      params
    );
  }

  async function transfer(params) {
    return post(
      "/api/pos/tables/transfer",
      params
    );
  }

  async function closeTable(params) {
    return post(
      "/api/pos/tables/close",
      params
    );
  }

  async function moveGuests(params) {
    return post(
      "/api/pos/tables/move-guests",
      params
    );
  }

  function getTableState(table) {
    if (!table) return "INVALID";

    if (table.status === "MERGED") {
      return "MERGED";
    }

    if (
      table.status === "OCCUPIED" ||
      Number(table.current_guests || 0) > 0
    ) {
      return "OCCUPIED";
    }

    return "AVAILABLE";
  }

  function canUnlockMenu({
    table,
    customer,
    guestCount,
    config,
  }) {
    if (!table) return false;

    if (
      config?.require_customer &&
      !customer
    ) {
      return false;
    }

    if (
      config?.require_guest_count &&
      Number(guestCount || 0) <= 0
    ) {
      return false;
    }

    return true;
  }

  function resolveGuests({
    config,
    guestCount,
  }) {
    if (!config?.require_guest_count) {
      return 1;
    }

    return Number(guestCount || 0);
  }

  return {
    openTable,
    closeTable,
    merge,
    transfer,
    moveGuests,
    getTableState,
    canUnlockMenu,
    resolveGuests,
  };
}
