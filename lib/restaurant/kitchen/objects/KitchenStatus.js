export const KitchenStatus = {

  NEW: "NEW",

  IN_PROGRESS: "IN_PROGRESS",

  READY: "READY",

  COMPLETED: "COMPLETED",

  CANCELLED: "CANCELLED",

};

export function canStart(status) {
  return status === KitchenStatus.NEW;
}

export function canReady(status) {
  return status === KitchenStatus.IN_PROGRESS;
}

export function canComplete(status) {
  return status === KitchenStatus.READY;
}
