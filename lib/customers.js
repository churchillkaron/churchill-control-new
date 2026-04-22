export function getCustomers() {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("customers")) || [];
}

export function saveCustomers(data) {
  localStorage.setItem("customers", JSON.stringify(data));
}

export function findOrCreateCustomer(name, phone) {
  const customers = getCustomers();

  let customer = customers.find((c) => c.phone === phone);

  if (!customer) {
    customer = {
      id: Date.now(),
      name,
      phone,
      visitCount: 0,
      noShowCount: 0,
      totalSpend: 0,
      tags: [],
      preferences: [],
      createdAt: new Date().toISOString(),
    };

    saveCustomers([...customers, customer]);
  }

  return customer;
}

export function updateCustomerAfterVisit(customerId, visit) {
  const customers = getCustomers();

  const updated = customers.map((customer) => {
    if (customer.id !== customerId) return customer;

    const nextCustomer = { ...customer };

    if (visit.status === "completed") {
      nextCustomer.visitCount = (nextCustomer.visitCount || 0) + 1;
      nextCustomer.totalSpend =
        (nextCustomer.totalSpend || 0) + (visit.spend || 0);
    }

    if (visit.status === "no-show") {
      nextCustomer.noShowCount = (nextCustomer.noShowCount || 0) + 1;
    }

    return nextCustomer;
  });

  saveCustomers(updated);
}