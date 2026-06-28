import { useState, useRef } from "react";

/**
 * Centralized waiter state machine
 * Replaces scattered modal + action logic
 */
export function useWaiterFlow() {
  const [activeMode, setActiveMode] = useState(null);
  const [activeTable, setActiveTable] = useState(null);

  const [customer, setCustomer] = useState(null);
  const [guestCount, setGuestCount] = useState(0);

  const lock = useRef(false);

  function resetFlow() {
    setActiveMode(null);
    lock.current = false;
  }

  function openTable(table) {
    setActiveTable(table);
    setActiveMode("TABLE_OPEN");
  }

  function startGuestFlow(table) {
    setActiveTable(table);
    setActiveMode("GUEST_SELECT");
  }

  function startCustomerFlow() {
    setActiveMode("CUSTOMER_SELECT");
  }

  function startMoveGuests(table) {
    setActiveTable(table);
    setActiveMode("MOVE_GUESTS");
  }

  function startTransfer(table) {
    setActiveTable(table);
    setActiveMode("TRANSFER_TABLE");
  }

  function startMerge(table) {
    setActiveTable(table);
    setActiveMode("MERGE_TABLES");
  }

  function setGuests(count) {
    setGuestCount(Number(count || 0));
  }

  function setCustomerSafe(c) {
    setCustomer(c);
  }

  return {
    activeMode,
    activeTable,
    customer,
    guestCount,

    setCustomerSafe,
    setGuests,

    openTable,
    startGuestFlow,
    startCustomerFlow,
    startMoveGuests,
    startTransfer,
    startMerge,

    resetFlow,
  };
}
