/**
 * PERIOD LOCK SYSTEM (ACCOUNTING FIRM GRADE)
 * Prevents modifications after period close
 */

const lockedPeriods = new Set();

export function lockPeriod(periodId) {
  lockedPeriods.add(periodId);
}

export function isPeriodLocked(periodId) {
  return lockedPeriods.has(periodId);
}

export function assertPeriodOpen(periodId) {
  if (lockedPeriods.has(periodId)) {
    throw new Error(`Finance Period Locked: ${periodId}`);
  }
}
