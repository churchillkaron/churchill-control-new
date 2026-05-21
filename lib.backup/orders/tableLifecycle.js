export function getOpenItems(order) {
  return (order.order_items || []).filter(
    item =>
      ![
        "SERVED",
        "CLOSED",
        "CANCELLED",
      ].includes(item.status)
  );
}

export function canRequestBill(order) {
  return getOpenItems(order).length === 0;
}

export function canCloseTable(order) {
  return (
    order.status === "BILLING" &&
    getOpenItems(order).length === 0
  );
}

export function getCourseItems(order, course) {
  return (order.order_items || []).filter(
    item => Number(item.course || 1) === Number(course)
  );
}

export function isCourseServed(order, course) {
  const items = getCourseItems(order, course);

  if (!items.length) return false;

  return items.every(
    item =>
      [
        "SERVED",
        "CLOSED",
        "CANCELLED",
      ].includes(item.status)
  );
}

export function getHighestCourse(order) {
  const courses = (order.order_items || []).map(
    item => Number(item.course || 1)
  );

  if (!courses.length) return 1;

  return Math.max(...courses);
}

export function hasNextCourse(order) {
  return Number(order.current_course || 1) < getHighestCourse(order);
}
